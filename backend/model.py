def call_model(prompt, model_id):
    if model_id == "amazon.titan-text-express-v1":
        return f"[CHEAP MODEL] Quick answer for: {prompt}"
    else:
        return f"[POWERFUL MODEL] Detailed answer for: {prompt}"

