from fastapi import FastAPI
from backend.router import route_prompt

app = FastAPI()

@app.get("/")
def home():
    return {"status": "Backend running"}

@app.post("/ask")
def ask(prompt: str):
    return route_prompt(prompt)