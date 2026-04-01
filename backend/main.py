from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.router import route_prompt

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    prompt: str


@app.get("/")
def home():
    return {"status": "Backend running"}


@app.get("/health")
def health():
    return home()


@app.post("/ask")
def ask(payload: AskRequest | None = Body(default=None), prompt: str | None = Query(default=None)):
    prompt_text = payload.prompt if payload else prompt
    if not prompt_text or not prompt_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Provide a prompt in the JSON body as {'prompt': '...'} or as ?prompt=...",
        )

    result = route_prompt(prompt_text.strip())
    status_code = 200 if result["ok"] else 502
    return JSONResponse(status_code=status_code, content=result)


if FRONTEND_DIR.exists():
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
