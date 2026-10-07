// ============================================================
// StudyMind - Frontend JavaScript
// Connected to FastAPI + Semantic Search + OpenAI Chat
// ============================================================

const API_BASE_URL = "http://127.0.0.1:8000";

// ============================================================
// GLOBAL STATE
// ============================================================

let uploadedDocuments = [];
let currentQuizQuestion = 0;
let quizScore = 0;
let currentFlashcard = 0;
let flashcardFlipped = false;

const demoQuiz = [
    {
        question: "What is the main purpose of semantic search?",
        options: [
            "To search only by exact keywords",
            "To find information based on meaning and context",
            "To delete duplicate documents",
            "To convert PDFs into images"
        ],
        answer: 1
    },
    {
        question: "What does RAG stand for?",
        options: [
            "Random Answer Generation",
            "Retrieval-Augmented Generation",
            "Rapid AI Generation",
            "Relevant Answer Gateway"
        ],
        answer: 1
    },
    {
        question: "Why does StudyMind retrieve document chunks before generating an answer?",
        options: [
            "To ground the answer in the uploaded material",
            "To make the interface colorful",
            "To reduce the number of documents",
            "To remove the user's question"
        ],
        answer: 0
    },
    {
        question: "What information helps the user verify an AI answer?",
        options: [
            "The AI's confidence color",
            "Source file and page information",
            "The browser version",
            "The upload date only"
        ],
        answer: 1
    }
];

const flashcards = [
    {
        front: "What is RAG?",
        back: "Retrieval-Augmented Generation. It retrieves relevant information from a knowledge source and gives that context to an LLM before generating an answer."
    },
    {
        front: "What is an embedding?",
        back: "A numerical representation of text that captures semantic meaning and allows similar pieces of text to be compared."
    },
    {
        front: "What is semantic search?",
        back: "A search technique that finds conceptually relevant information rather than relying only on exact keyword matches."
    },
    {
        front: "Why are source references important?",
        back: "They allow users to verify where an AI-generated answer came from and improve trust in the system."
    }
];

// ============================================================
// DOM READY
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    initializeNavigation();
    initializeTheme();
    initializeFileUpload();
    initializeChat();
    initializeDocumentSearch();
    initializeQuiz();
    initializeFlashcards();
    initializeDashboard();
    initializeButtons();

    checkBackend();
    renderUploadedDocuments();
    updateDashboardStats();
});

// ============================================================
// NAVIGATION
// ============================================================

function initializeNavigation() {
    const navItems = document.querySelectorAll("[data-page]");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const page = item.getAttribute("data-page");
            navigateTo(page);
        });
    });
}

function navigateTo(pageName) {
    const pages = document.querySelectorAll(".page");

    pages.forEach(page => {
        page.classList.remove("active");
    });

    const targetPage = document.getElementById(pageName);

    if (targetPage) {
        targetPage.classList.add("active");
    }

    const navItems = document.querySelectorAll("[data-page]");

    navItems.forEach(item => {
        item.classList.remove("active");

        if (item.getAttribute("data-page") === pageName) {
            item.classList.add("active");
        }
    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ============================================================
// THEME
// ============================================================

function initializeTheme() {
    const themeButton =
        document.getElementById("themeToggle") ||
        document.querySelector(".theme-toggle");

    if (!themeButton) return;

    themeButton.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");

        const isDark = document.body.classList.contains("dark-mode");

        localStorage.setItem("studymind-theme", isDark ? "dark" : "light");

        showNotification(
            isDark ? "Dark mode enabled" : "Light mode enabled",
            "success"
        );
    });

    const savedTheme = localStorage.getItem("studymind-theme");

    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
    }
}

// ============================================================
// BACKEND CONNECTION CHECK
// ============================================================

async function checkBackend() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);

        if (!response.ok) {
            throw new Error("Backend unavailable");
        }

        console.log("StudyMind backend connected successfully.");
    } catch (error) {
        console.warn(
            "StudyMind backend is not connected. Start FastAPI with:",
            "python -m uvicorn main:app --reload"
        );
    }
}

// ============================================================
// FILE UPLOAD
// ============================================================

function initializeFileUpload() {
    const fileInput = document.getElementById("fileInput");
    const uploadArea = document.getElementById("uploadArea");

    if (!fileInput) return;

    fileInput.addEventListener("change", event => {
        const files = Array.from(event.target.files);

        if (files.length > 0) {
            uploadFiles(files);
        }
    });

    if (uploadArea) {
        uploadArea.addEventListener("dragover", event => {
            event.preventDefault();
            uploadArea.classList.add("dragover");
        });

        uploadArea.addEventListener("dragleave", () => {
            uploadArea.classList.remove("dragover");
        });

        uploadArea.addEventListener("drop", event => {
            event.preventDefault();

            uploadArea.classList.remove("dragover");

            const files = Array.from(event.dataTransfer.files);

            if (files.length > 0) {
                uploadFiles(files);
            }
        });
    }
}

async function uploadFiles(files) {
    const validFiles = files.filter(file => {
        const name = file.name.toLowerCase();

        return (
            name.endsWith(".pdf") ||
            name.endsWith(".txt")
        );
    });

    if (validFiles.length === 0) {
        showNotification(
            "Please upload PDF or TXT files only.",
            "error"
        );

        return;
    }

    for (const file of validFiles) {
        await uploadSingleFile(file);
    }
}

async function uploadSingleFile(file) {
    showNotification(`Uploading ${file.name}...`, "info");

    const formData = new FormData();

    formData.append("file", file);

    try {
        const response = await fetch(
            `${API_BASE_URL}/upload`,
            {
                method: "POST",
                body: formData
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "Upload failed"
            );
        }

        uploadedDocuments.push({
            filename: data.filename || file.name,
            chunks: data.chunks || 0,
            characters: data.characters || 0,
            uploadedAt: new Date()
        });

        renderUploadedDocuments();
        updateDashboardStats();

        showNotification(
            `${file.name} uploaded successfully.`,
            "success"
        );

        console.log("Upload response:", data);

    } catch (error) {
        console.error("Upload error:", error);

        showNotification(
            `Could not upload ${file.name}: ${error.message}`,
            "error"
        );
    }
}

// ============================================================
// DOCUMENT LIST
// ============================================================

function renderUploadedDocuments() {
    const documentList =
        document.getElementById("documentList");

    if (!documentList) return;

    if (uploadedDocuments.length === 0) {
        documentList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📚</div>
                <h3>No documents uploaded yet</h3>
                <p>Upload PDF or TXT study material to build your knowledge base.</p>
            </div>
        `;

        return;
    }

    documentList.innerHTML = uploadedDocuments
        .map((doc, index) => {
            return `
                <div class="document-item">
                    <div class="document-icon">
                        ${doc.filename.toLowerCase().endsWith(".pdf")
                            ? "📕"
                            : "📄"}
                    </div>

                    <div class="document-info">
                        <h4>${escapeHTML(doc.filename)}</h4>

                        <p>
                            ${doc.chunks || 0} chunks
                            ${doc.characters
                                ? ` • ${doc.characters.toLocaleString()} characters`
                                : ""}
                        </p>
                    </div>

                    <button
                        class="document-action"
                        onclick="removeDocument(${index})"
                        title="Remove from current session"
                    >
                        ×
                    </button>
                </div>
            `;
        })
        .join("");
}

function removeDocument(index) {
    uploadedDocuments.splice(index, 1);

    renderUploadedDocuments();
    updateDashboardStats();

    showNotification(
        "Document removed from the frontend list. Restarting the backend clears its in-memory index.",
        "info"
    );
}

// ============================================================
// DOCUMENT SEARCH
// ============================================================

function initializeDocumentSearch() {
    const searchInput =
        document.getElementById("documentSearch");

    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
        const query = searchInput.value
            .toLowerCase()
            .trim();

        const items =
            document.querySelectorAll(".document-item");

        items.forEach(item => {
            const text =
                item.textContent.toLowerCase();

            item.style.display =
                text.includes(query)
                    ? ""
                    : "none";
        });
    });
}

// ============================================================
// AI CHAT
// ============================================================

function initializeChat() {
    const chatInput =
        document.getElementById("chatInput");

    const chatSend =
        document.getElementById("chatSend");

    if (chatSend) {
        chatSend.addEventListener("click", sendChatMessage);
    }

    if (chatInput) {
        chatInput.addEventListener("keydown", event => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                sendChatMessage();
            }
        });
    }
}

async function sendChatMessage() {
    const chatInput =
        document.getElementById("chatInput");

    const chatMessages =
        document.getElementById("chatMessages");

    if (!chatInput || !chatMessages) return;

    const question =
        chatInput.value.trim();

    if (!question) return;

    addChatMessage(question, "user");

    chatInput.value = "";

    const loadingMessage =
        addChatMessage(
            "Searching your uploaded documents...",
            "assistant loading-message"
        );

    try {
        const response = await fetch(
            `${API_BASE_URL}/chat`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: question,
                    top_k: 5
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "Chat request failed"
            );
        }

        if (loadingMessage) {
            loadingMessage.remove();
        }

        addChatMessage(
            data.answer ||
            "I couldn't generate an answer.",
            "assistant"
        );

        renderEvidence(
            data.sources || []
        );

    } catch (error) {
        console.error("Chat error:", error);

        if (loadingMessage) {
            loadingMessage.remove();
        }

        addChatMessage(
            "I couldn't connect to the StudyMind AI backend. Please make sure the FastAPI server is running.",
            "assistant error-message"
        );

        showNotification(
            "AI backend connection failed.",
            "error"
        );
    }
}

function addChatMessage(message, type) {
    const chatMessages =
        document.getElementById("chatMessages");

    if (!chatMessages) return null;

    const messageElement =
        document.createElement("div");

    const cleanType =
        type.split(" ")[0];

    messageElement.className =
        `chat-message ${cleanType}`;

    messageElement.innerHTML = `
        <div class="message-content">
            ${formatChatText(message)}
        </div>
    `;

    chatMessages.appendChild(messageElement);

    chatMessages.scrollTop =
        chatMessages.scrollHeight;

    return messageElement;
}

// ============================================================
// EVIDENCE / SOURCES
// ============================================================

function renderEvidence(sources) {
    const evidencePanel =
        document.getElementById("evidencePanel");

    if (!evidencePanel) return;

    if (!sources || sources.length === 0) {
        evidencePanel.innerHTML = `
            <div class="evidence-empty">
                <p>No source evidence was returned.</p>
            </div>
        `;

        return;
    }

    evidencePanel.innerHTML = `
        <div class="evidence-header">
            <h3>🔎 Retrieved Evidence</h3>
            <span>${sources.length} sources</span>
        </div>

        <div class="evidence-list">
            ${sources.map((source, index) => `
                <div class="evidence-card">

                    <div class="evidence-top">
                        <strong>
                            Source ${index + 1}
                        </strong>

                        <span class="source-score">
                            ${formatScore(source.score)}
                        </span>
                    </div>

                    <div class="source-name">
                        📄 ${escapeHTML(
                            source.filename ||
                            "Uploaded document"
                        )}
                    </div>

                    ${
                        source.page
                            ? `<div class="source-page">
                                Page ${source.page}
                               </div>`
                            : ""
                    }

                    <p class="evidence-text">
                        ${escapeHTML(
                            source.snippet ||
                            source.text ||
                            "No snippet available."
                        )}
                    </p>

                </div>
            `).join("")}
        </div>
    `;
}

function formatScore(score) {
    if (score === undefined || score === null) {
        return "Relevant";
    }

    const numericScore =
        Number(score);

    if (Number.isNaN(numericScore)) {
        return "Relevant";
    }

    return `Score: ${numericScore.toFixed(3)}`;
}

// ============================================================
// DASHBOARD
// ============================================================

function initializeDashboard() {
    const quickPrompts =
        document.querySelectorAll(
            "[data-prompt]"
        );

    quickPrompts.forEach(button => {
        button.addEventListener("click", () => {
            const prompt =
                button.getAttribute("data-prompt");

            const chatInput =
                document.getElementById("chatInput");

            if (chatInput) {
                chatInput.value = prompt;

                navigateTo("chat");

                chatInput.focus();
            }
        });
    });
}

function updateDashboardStats() {
    const documentCount =
        document.getElementById("documentCount");

    if (documentCount) {
        documentCount.textContent =
            uploadedDocuments.length;
    }

    const totalChunks =
        uploadedDocuments.reduce(
            (total, doc) =>
                total + (doc.chunks || 0),
            0
        );

    const chunkCount =
        document.getElementById("chunkCount");

    if (chunkCount) {
        chunkCount.textContent =
            totalChunks;
    }
}

// ============================================================
// QUIZ
// ============================================================

function initializeQuiz() {
    const quizContainer =
        document.getElementById("quizContainer");

    if (!quizContainer) return;

    renderQuizQuestion();
}

function renderQuizQuestion() {
    const quizContainer =
        document.getElementById("quizContainer");

    if (!quizContainer) return;

    const question =
        demoQuiz[currentQuizQuestion];

    if (!question) {
        renderQuizResults();
        return;
    }

    quizContainer.innerHTML = `
        <div class="quiz-progress">
            Question ${currentQuizQuestion + 1}
            of ${demoQuiz.length}
        </div>

        <h3>${escapeHTML(question.question)}</h3>

        <div class="quiz-options">
            ${question.options.map((option, index) => `
                <button
                    class="quiz-option"
                    onclick="answerQuiz(${index})"
                >
                    ${escapeHTML(option)}
                </button>
            `).join("")}
        </div>
    `;
}

function answerQuiz(selectedIndex) {
    const question =
        demoQuiz[currentQuizQuestion];

    const options =
        document.querySelectorAll(
            ".quiz-option"
        );

    options.forEach((option, index) => {
        option.disabled = true;

        if (index === question.answer) {
            option.classList.add("correct");
        }

        if (
            index === selectedIndex &&
            selectedIndex !== question.answer
        ) {
            option.classList.add("incorrect");
        }
    });

    if (selectedIndex === question.answer) {
        quizScore++;
    }

    setTimeout(() => {
        currentQuizQuestion++;

        renderQuizQuestion();
    }, 900);
}

function renderQuizResults() {
    const quizContainer =
        document.getElementById("quizContainer");

    if (!quizContainer) return;

    quizContainer.innerHTML = `
        <div class="quiz-results">

            <div class="result-icon">🎉</div>

            <h3>Quiz Complete!</h3>

            <p>
                You scored
                <strong>
                    ${quizScore} / ${demoQuiz.length}
                </strong>
            </p>

            <button
                class="primary-button"
                onclick="restartQuiz()"
            >
                Try Again
            </button>

        </div>
    `;
}

function restartQuiz() {
    currentQuizQuestion = 0;
    quizScore = 0;

    renderQuizQuestion();
}

// ============================================================
// FLASHCARDS
// ============================================================

function initializeFlashcards() {
    renderFlashcard();

    const flashcard =
        document.getElementById("flashcard");

    if (flashcard) {
        flashcard.addEventListener(
            "click",
            flipFlashcard
        );
    }

    const nextButton =
        document.getElementById("nextFlashcard");

    const previousButton =
        document.getElementById(
            "previousFlashcard"
        );

    if (nextButton) {
        nextButton.addEventListener(
            "click",
            nextFlashcard
        );
    }

    if (previousButton) {
        previousButton.addEventListener(
            "click",
            previousFlashcard
        );
    }
}

function renderFlashcard() {
    const flashcard =
        document.getElementById("flashcard");

    if (!flashcard) return;

    const card =
        flashcards[currentFlashcard];

    flashcardFlipped = false;

    flashcard.classList.remove("flipped");

    flashcard.innerHTML = `
        <div class="flashcard-inner">

            <div class="flashcard-front">
                <span>QUESTION</span>
                <h3>${escapeHTML(card.front)}</h3>
                <small>Click to reveal answer</small>
            </div>

            <div class="flashcard-back">
                <span>ANSWER</span>
                <p>${escapeHTML(card.back)}</p>
            </div>

        </div>
    `;
}

function flipFlashcard() {
    const flashcard =
        document.getElementById("flashcard");

    if (!flashcard) return;

    flashcardFlipped =
        !flashcardFlipped;

    flashcard.classList.toggle(
        "flipped",
        flashcardFlipped
    );
}

function nextFlashcard() {
    currentFlashcard =
        (currentFlashcard + 1) %
        flashcards.length;

    renderFlashcard();
}

function previousFlashcard() {
    currentFlashcard =
        (currentFlashcard - 1 +
            flashcards.length) %
        flashcards.length;

    renderFlashcard();
}

// ============================================================
// BUTTONS
// ============================================================

function initializeButtons() {
    document.querySelectorAll(
        "[data-action]"
    ).forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const action =
                    button.getAttribute(
                        "data-action"
                    );

                handleAction(action);
            }
        );
    });
}

function handleAction(action) {
    switch (action) {

        case "upload":
            navigateTo("documents");

            document
                .getElementById("fileInput")
                ?.click();

            break;

        case "chat":
            navigateTo("chat");

            document
                .getElementById("chatInput")
                ?.focus();

            break;

        case "quiz":
            navigateTo("quiz");
            break;

        case "flashcards":
            navigateTo("flashcards");
            break;

        case "analytics":
            navigateTo("analytics");
            break;

        default:
            console.log(
                "Unknown action:",
                action
            );
    }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function showNotification(message, type = "info") {
    let container =
        document.getElementById(
            "notificationContainer"
        );

    if (!container) {
        container =
            document.createElement("div");

        container.id =
            "notificationContainer";

        container.className =
            "notification-container";

        document.body.appendChild(container);
    }

    const notification =
        document.createElement("div");

    notification.className =
        `notification ${type}`;

    notification.textContent =
        message;

    container.appendChild(
        notification
    );

    setTimeout(() => {
        notification.classList.add(
            "show"
        );
    }, 10);

    setTimeout(() => {
        notification.classList.remove(
            "show"
        );

        setTimeout(() => {
            notification.remove();
        }, 300);

    }, 3500);
}

// ============================================================
// TEXT FORMATTING
// ============================================================

function formatChatText(text) {
    if (!text) return "";

    let safeText =
        escapeHTML(String(text));

    safeText =
        safeText.replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        );

    safeText =
        safeText.replace(
            /\n/g,
            "<br>"
        );

    return safeText;
}

function escapeHTML(value) {
    const div =
        document.createElement("div");

    div.textContent =
        value ?? "";

    return div.innerHTML;
}

// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.navigateTo = navigateTo;
window.uploadFiles = uploadFiles;
window.removeDocument = removeDocument;
window.answerQuiz = answerQuiz;
window.restartQuiz = restartQuiz;
window.flipFlashcard = flipFlashcard;
window.nextFlashcard = nextFlashcard;
window.previousFlashcard = previousFlashcard;
window.sendChatMessage = sendChatMessage;

console.log(
    "StudyMind frontend loaded successfully."
);