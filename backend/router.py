from backend.model import (
    BedrockInvocationError,
    LLAMA_MODEL_ID,
    MISTRAL_MODEL_ID,
    call_model,
)


def choose_model(prompt: str) -> str:
    if len(prompt.split()) < 10:
        return MISTRAL_MODEL_ID
    return LLAMA_MODEL_ID


def route_prompt(prompt: str) -> dict:
    word_count = len(prompt.split())
    model_id = choose_model(prompt)
    try:
        response = call_model(prompt, model_id)
    except BedrockInvocationError as exc:
        debug = {
            "prompt_word_count": word_count,
            "routing_reason": (
                "Prompt has fewer than 10 words, so it was routed to Mistral Small."
                if model_id == MISTRAL_MODEL_ID
                else "Prompt has 10 or more words, so it was routed to Llama 3.1 8B."
            ),
            **exc.details,
        }
        return {
            "ok": False,
            "prompt": prompt,
            "model_used": model_id,
            "response": None,
            "error": str(exc),
            "debug": debug,
        }

    debug = {
        "prompt_word_count": word_count,
        "routing_reason": (
            "Prompt has fewer than 10 words, so it was routed to Mistral Small."
            if model_id == MISTRAL_MODEL_ID
            else "Prompt has 10 or more words, so it was routed to Llama 3.1 8B."
        ),
        **response["debug"],
    }
    return {
        "ok": True,
        "prompt": prompt,
        "model_used": model_id,
        "response": response["text"],
        "debug": debug,
    }
