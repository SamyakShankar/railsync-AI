import json
import logging
import os
from dataclasses import dataclass

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

LLAMA_MODEL_ID = "meta.llama3-1-8b-instruct-v1:0"
MISTRAL_MODEL_ID = "mistral.mistral-small-2402-v1:0"
LLAMA_INFERENCE_PROFILE_ID = (
    os.getenv("BEDROCK_LLAMA_INFERENCE_PROFILE_ID") or "us.meta.llama3-1-8b-instruct-v1:0"
)


@dataclass
class BedrockInvocationError(Exception):
    message: str
    details: dict

    def __str__(self) -> str:
        return self.message


def _resolve_region() -> str:
    return (
        os.getenv("AWS_REGION")
        or os.getenv("AWS_DEFAULT_REGION")
        or boto3.Session().region_name
        or "us-east-1"
    )


def _format_llama_prompt(prompt: str) -> str:
    return (
        "<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n"
        f"{prompt}\n"
        "<|eot_id|>\n"
        "<|start_header_id|>assistant<|end_header_id|>\n"
    )


def _format_mistral_prompt(prompt: str) -> str:
    return f"<s>[INST] {prompt} [/INST]"


def _build_llama_request(prompt: str) -> dict:
    return {
        "prompt": _format_llama_prompt(prompt),
        "max_gen_len": 200,
        "temperature": 0.5,
        "top_p": 0.9,
    }


def _build_mistral_request(prompt: str) -> dict:
    return {
        "prompt": _format_mistral_prompt(prompt),
        "max_tokens": 200,
        "temperature": 0.5,
    }


def _build_request(prompt: str, model_id: str) -> dict:
    if model_id.startswith("meta.llama") or model_id.startswith("us.meta.llama"):
        return _build_llama_request(prompt)
    if model_id.startswith("mistral."):
        return _build_mistral_request(prompt)
    raise BedrockInvocationError(
        "Unsupported Bedrock model",
        {
            "model_id": model_id,
            "supported_models": [MISTRAL_MODEL_ID, LLAMA_MODEL_ID, LLAMA_INFERENCE_PROFILE_ID],
        },
    )


def _parse_response(result: dict, model_id: str) -> dict:
    if model_id.startswith("meta.llama") or model_id.startswith("us.meta.llama"):
        generation = result.get("generation")
        if not generation:
            raise KeyError("generation")
        return {
            "text": generation.strip(),
            "debug": {
                "prompt_token_count": result.get("prompt_token_count"),
                "generation_token_count": result.get("generation_token_count"),
                "stop_reason": result.get("stop_reason"),
            },
        }

    if model_id.startswith("mistral."):
        outputs = result.get("outputs") or []
        first_output = outputs[0] if outputs else {}
        generation = first_output.get("text")
        if not generation:
            raise KeyError("outputs[0].text")
        return {
            "text": generation.strip(),
            "debug": {
                "prompt_token_count": result.get("prompt_token_count"),
                "generation_token_count": result.get("generation_token_count"),
                "stop_reason": first_output.get("stop_reason"),
            },
        }

    raise KeyError("unsupported model response")


def _invoke_model(client, model_id: str, request_body: dict):
    return client.invoke_model(
        modelId=model_id,
        body=json.dumps(request_body),
        contentType="application/json",
        accept="application/json",
    )


def _should_retry_with_profile(exc: ClientError, model_id: str) -> bool:
    error = exc.response.get("Error", {})
    message = error.get("Message", "")
    return (
        model_id == LLAMA_MODEL_ID
        and error.get("Code") == "ValidationException"
        and "inference profile" in message.lower()
    )


def call_model(prompt: str, model_id: str) -> dict:
    region = _resolve_region()
    client = boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 1}),
    )
    request_body = _build_request(prompt, model_id)
    invoked_model_id = model_id
    profile_fallback_used = False

    try:
        response = _invoke_model(client, invoked_model_id, request_body)
        result = json.loads(response["body"].read())
    except ClientError as exc:
        if _should_retry_with_profile(exc, model_id):
            invoked_model_id = LLAMA_INFERENCE_PROFILE_ID
            profile_fallback_used = True
            try:
                response = _invoke_model(client, invoked_model_id, request_body)
                result = json.loads(response["body"].read())
            except (ClientError, BotoCoreError, json.JSONDecodeError) as retry_exc:
                details = {
                    "region": region,
                    "model_id": model_id,
                    "invoked_model_id": invoked_model_id,
                    "request_body": request_body,
                    "error_type": type(retry_exc).__name__,
                    "exception": str(retry_exc),
                    "profile_fallback_used": profile_fallback_used,
                }
                if isinstance(retry_exc, ClientError):
                    details["aws_error"] = retry_exc.response.get("Error", {})
                    details["request_id"] = retry_exc.response.get("ResponseMetadata", {}).get("RequestId")
                logger.exception("Bedrock invoke_model failed after inference profile fallback")
                raise BedrockInvocationError("Bedrock request failed", details) from retry_exc
        else:
            details = {
                "region": region,
                "model_id": model_id,
                "invoked_model_id": invoked_model_id,
                "request_body": request_body,
                "error_type": type(exc).__name__,
                "exception": str(exc),
                "profile_fallback_used": profile_fallback_used,
            }
            details["aws_error"] = exc.response.get("Error", {})
            details["request_id"] = exc.response.get("ResponseMetadata", {}).get("RequestId")
            logger.exception("Bedrock invoke_model failed")
            raise BedrockInvocationError("Bedrock request failed", details) from exc
    except (ClientError, BotoCoreError, json.JSONDecodeError) as exc:
        details = {
            "region": region,
            "model_id": model_id,
            "invoked_model_id": invoked_model_id,
            "request_body": request_body,
            "error_type": type(exc).__name__,
            "exception": str(exc),
            "profile_fallback_used": profile_fallback_used,
        }
        if isinstance(exc, ClientError):
            details["aws_error"] = exc.response.get("Error", {})
            details["request_id"] = exc.response.get("ResponseMetadata", {}).get("RequestId")
        logger.exception("Bedrock invoke_model failed")
        raise BedrockInvocationError("Bedrock request failed", details) from exc

    try:
        parsed_response = _parse_response(result, model_id)
    except KeyError as exc:
        details = {
            "region": region,
            "model_id": model_id,
            "invoked_model_id": invoked_model_id,
            "request_body": request_body,
            "raw_response": result,
            "request_id": response.get("ResponseMetadata", {}).get("RequestId"),
            "parse_error": str(exc),
            "profile_fallback_used": profile_fallback_used,
        }
        logger.error("Bedrock response missing expected fields")
        raise BedrockInvocationError("Bedrock response missing expected fields", details) from exc

    return {
        "text": parsed_response["text"],
        "debug": {
            "region": region,
            "model_id": model_id,
            "invoked_model_id": invoked_model_id,
            "request_id": response.get("ResponseMetadata", {}).get("RequestId"),
            "profile_fallback_used": profile_fallback_used,
            "request_format": (
                "llama_native_prompt"
                if model_id.startswith("meta.llama") or model_id.startswith("us.meta.llama")
                else "mistral_native_prompt"
            ),
            **parsed_response["debug"],
        },
    }
