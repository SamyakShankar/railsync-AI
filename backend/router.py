from backend.model import call_model

def choose_model(prompt):
    words = len(prompt.split())

    # Basic routing logic (your algorithm v1)
    if words < 10:
        return "amazon.titan-text-express-v1"
    else:
        return "anthropic.claude-v2"

def route_prompt(prompt):
    model_id = choose_model(prompt)
    response = call_model(prompt, model_id)

    return {
        "prompt": prompt,
        "prompt_length": len(prompt.split()),
        "model_used": model_id,
        "decision_reason": (
            "Short prompt → Cheap model"
            if model_id == "amazon.titan-text-express-v1"
            else "Complex prompt → Powerful model"
        ),
        "response": response
    }