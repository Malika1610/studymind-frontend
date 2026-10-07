from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from openai import OpenAI

import fitz
import faiss
import numpy as np
import os


# ==========================================
# ENVIRONMENT
# ==========================================

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY was not found in .env")

client = OpenAI(api_key=OPENAI_API_KEY)


# ==========================================
# FASTAPI APP
# ==========================================

app = FastAPI(
    title="StudyMind API",
    description="AI-powered Smart Document Knowledge Assistant",
    version="1.0.0"
)


# Allow the frontend to communicate with FastAPI

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# EMBEDDING MODEL
# ==========================================

print("Loading embedding model...")

model = SentenceTransformer(
    "all-MiniLM-L6-v2"
)

print("Embedding model loaded successfully.")


# ==========================================
# DOCUMENT STORAGE
# ==========================================

document_chunks = []

vector_index = None


# ==========================================
# REQUEST MODELS
# ==========================================

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class ChatRequest(BaseModel):
    query: str
    top_k: int = 5


# ==========================================
# TEXT CHUNKING
# ==========================================

def chunk_text(
    text,
    chunk_size=800,
    overlap=100
):

    chunks = []

    start = 0

    while start < len(text):

        end = start + chunk_size

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        start += chunk_size - overlap

    return chunks


# ==========================================
# HOME
# ==========================================

@app.get("/")
def home():

    return {
        "message": "StudyMind backend is running!",
        "status": "success"
    }


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
def health_check():

    return {
        "status": "healthy",
        "documents": len(document_chunks)
    }


# ==========================================
# UPLOAD DOCUMENT
# ==========================================

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    global document_chunks
    global vector_index

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="No file selected"
        )


    filename = file.filename.lower()


    # --------------------------------------
    # TXT
    # --------------------------------------

    if filename.endswith(".txt"):

        content = await file.read()

        text = content.decode(
            "utf-8",
            errors="ignore"
        )

        chunks = chunk_text(text)

        new_chunks = []

        for chunk in chunks:

            new_chunks.append({
                "text": chunk,
                "filename": file.filename,
                "page": None
            })


    # --------------------------------------
    # PDF
    # --------------------------------------

    elif filename.endswith(".pdf"):

        content = await file.read()

        pdf = fitz.open(
            stream=content,
            filetype="pdf"
        )

        new_chunks = []


        for page_number, page in enumerate(
            pdf,
            start=1
        ):

            page_text = page.get_text().strip()

            if not page_text:
                continue


            chunks = chunk_text(
                page_text
            )


            for chunk in chunks:

                new_chunks.append({
                    "text": chunk,
                    "filename": file.filename,
                    "page": page_number
                })


        pdf.close()


    else:

        raise HTTPException(
            status_code=400,
            detail="Only PDF and TXT files are supported"
        )


    if not new_chunks:

        raise HTTPException(
            status_code=400,
            detail="No readable text was found in the document"
        )


    # --------------------------------------
    # EMBEDDINGS
    # --------------------------------------

    texts = [
        item["text"]
        for item in new_chunks
    ]


    embeddings = model.encode(
        texts,
        normalize_embeddings=True
    )


    embeddings = np.array(
        embeddings,
        dtype="float32"
    )


    # Add new documents to existing collection

    document_chunks.extend(
        new_chunks
    )


    # --------------------------------------
    # REBUILD FAISS INDEX
    # --------------------------------------

    all_texts = [
        item["text"]
        for item in document_chunks
    ]


    all_embeddings = model.encode(
        all_texts,
        normalize_embeddings=True
    )


    all_embeddings = np.array(
        all_embeddings,
        dtype="float32"
    )


    dimension = all_embeddings.shape[1]


    vector_index = faiss.IndexFlatIP(
        dimension
    )


    vector_index.add(
        all_embeddings
    )


    return {

        "filename": file.filename,

        "characters": len(
            "\n".join(texts)
        ),

        "chunk_count": len(
            new_chunks
        ),

        "total_chunks": len(
            document_chunks
        ),

        "embedding_dimension": dimension,

        "message":
            "Document processed, chunked, embedded and indexed successfully"
    }


# ==========================================
# SEMANTIC SEARCH
# ==========================================

@app.post("/search")
def search_documents(
    request: SearchRequest
):

    if (
        vector_index is None
        or not document_chunks
    ):

        raise HTTPException(
            status_code=400,
            detail="Please upload a document before searching"
        )


    query_embedding = model.encode(
        [request.query],
        normalize_embeddings=True
    )


    query_embedding = np.array(
        query_embedding,
        dtype="float32"
    )


    top_k = min(
        request.top_k,
        len(document_chunks)
    )


    scores, indices = vector_index.search(
        query_embedding,
        top_k
    )


    results = []


    for score, index in zip(
        scores[0],
        indices[0]
    ):

        chunk = document_chunks[index]


        results.append({

            "score": float(score),

            "text": chunk["text"],

            "filename":
                chunk["filename"],

            "page":
                chunk["page"]
        })


    return {

        "query": request.query,

        "results": results
    }


# ==========================================
# AI CHAT / RAG
# ==========================================

@app.post("/chat")
def chat_with_documents(
    request: ChatRequest
):

    if (
        vector_index is None
        or not document_chunks
    ):

        raise HTTPException(
            status_code=400,
            detail="Please upload at least one document before asking questions."
        )


    # --------------------------------------
    # STEP 1: RETRIEVE RELEVANT CHUNKS
    # --------------------------------------

    query_embedding = model.encode(
        [request.query],
        normalize_embeddings=True
    )


    query_embedding = np.array(
        query_embedding,
        dtype="float32"
    )


    top_k = min(
        request.top_k,
        len(document_chunks)
    )


    scores, indices = vector_index.search(
        query_embedding,
        top_k
    )


    retrieved_context = []

    sources = []


    for rank, (score, index) in enumerate(
        zip(scores[0], indices[0]),
        start=1
    ):

        chunk = document_chunks[index]


        source_name = chunk["filename"]

        page = chunk["page"]


        if page:

            source_label = (
                f"{source_name}, Page {page}"
            )

        else:

            source_label = source_name


        retrieved_context.append(
            f"""
SOURCE {rank}
File: {source_label}
Relevance Score: {float(score):.3f}

Content:
{chunk["text"]}
"""
        )


        sources.append({

            "rank": rank,

            "filename":
                source_name,

            "page":
                page,

            "score":
                float(score),

            "snippet":
                chunk["text"]
        })


    context = "\n\n".join(
        retrieved_context
    )


    # --------------------------------------
    # STEP 2: ASK LLM
    # --------------------------------------

    system_instructions = """
You are StudyMind, an academic document knowledge assistant.

Your job is to answer questions using ONLY the information
contained in the provided document context.

Rules:

1. Do not invent information.
2. Do not use outside knowledge when the documents do not support an answer.
3. If the answer cannot be found in the documents, clearly say:
   "I couldn't find that information in the uploaded documents."
4. Give clear and useful explanations.
5. When possible, mention the source file and page number.
6. Keep answers concise but educational.
7. Treat the retrieved document content as evidence.
"""


    user_prompt = f"""
DOCUMENT CONTEXT:

{context}


USER QUESTION:

{request.query}


Answer the user's question using only the document context above.
"""


    try:

        response = client.responses.create(

            model="gpt-4.1-mini",

            instructions=
                system_instructions,

            input=user_prompt
        )


        answer = response.output_text


    except Exception as error:

        print(
            "OpenAI API error:",
            error
        )

        raise HTTPException(

            status_code=500,

            detail=
                "The AI answer service could not be reached."
        )


    # --------------------------------------
    # RETURN ANSWER + SOURCES
    # --------------------------------------

    return {

        "query":
            request.query,

        "answer":
            answer,

        "sources":
            sources
    }