# 📖 The Story Forge

> AI-powered chapter-by-chapter story writing — local or cloud, your choice

![Story Forge](https://img.shields.io/badge/Story%20Forge-AI%20Writer-e8c97e?style=for-the-badge)
![License](https://img.shields.io/badge/License-Free-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android-blue?style=for-the-badge)

---

## ✨ What Is This?

**The Story Forge** is a free AI-powered story writing app that helps you write full novels chapter by chapter. You give it your story idea, characters, and genre — and the AI writes each chapter for you, remembering everything from previous chapters so your story stays consistent.

---

## 🚀 Try It Now (No Install Needed)

👉 **[Open The Story Forge](https://its-ashley207.github.io/storyforge/)**

Works on any device — phone, tablet, or PC — directly in your browser.

---

## 🤖 Choose Your AI

### ☁️ Cloud AI — Works everywhere, no setup
Use your own API key from any of these providers:

| Provider | Model | Free Tier? | Get Key |
|---|---|---|---|
| **Claude** (Anthropic) | claude-sonnet-4 | No | [console.anthropic.com](https://console.anthropic.com) |
| **ChatGPT** (OpenAI) | gpt-4o | No | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Gemini** (Google) | gemini-2.0-flash | ✅ Yes | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

### 🖥️ Local AI — Free forever, no API key needed
Run AI completely on your own PC using [Ollama](https://ollama.com). No internet required after setup.

---

## 🎯 Features

- ✅ **Chapter-by-chapter writing** — generate one chapter at a time
- ✅ **Story memory** — AI remembers all previous chapters for consistency
- ✅ **Chapter suggestions** — tell the AI what should happen in each chapter
- ✅ **Redo button** — not happy with a chapter? Regenerate it instantly
- ✅ **Custom genre** — type any genre freely or pick from 35+ presets
- ✅ **16 tone options** — all optional, including no tone at all
- ✅ **Word count control** — choose 300 to 2000 words per chapter
- ✅ **Live streaming** — watch the story write itself in real time
- ✅ **Mobile friendly** — works great on phones and tablets
- ✅ **Works offline** — use with Ollama for fully offline writing

---

## 📱 How To Use

### On Your Phone or Any Browser
1. Open **[https://its-ashley207.github.io/storyforge/](https://its-ashley207.github.io/storyforge/)**
2. Choose **Cloud AI** tab
3. Pick a provider and paste your API key
4. Fill in your story details
5. Click **Generate Chapter 1** and start writing!

### On PC with Local AI (Free, No API Key)
1. Download and install [Ollama](https://ollama.com)
2. Open Command Prompt and run:
   ```
   ollama pull llama3.2
   ```
3. Download the ZIP from this repo
4. Extract it and double-click **`Start Story Forge.bat`**
5. The app opens automatically with Ollama connected!

---

## 📦 Download for PC (Offline Version)

Download the latest release ZIP from this repo which includes:

| File | Description |
|---|---|
| `index.html` | The full app — open in any browser |
| `Start Story Forge.bat` | One-click launcher for Ollama users |
| `README.txt` | Quick start guide |
| `storyforge-twa/` | Android Studio project for APK building |

---

## 📲 Android App

This project includes a full **Android TWA (Trusted Web Activity)** project so you can build and publish to the **Google Play Store**.

See [`PUBLISHING_GUIDE.md`](storyforge-twa/PUBLISHING_GUIDE.md) for step-by-step instructions.

---

## 🛠️ Tech Stack

- **Frontend** — Pure HTML, CSS, JavaScript (no frameworks, no build tools)
- **AI (Cloud)** — Anthropic API, OpenAI API, Google Gemini API
- **AI (Local)** — Ollama (runs Llama 3.2, Mistral, Phi-3, and more)
- **Hosting** — GitHub Pages
- **Android** — Trusted Web Activity (TWA) via Android Browser Helper

---

## 🗂️ Project Structure

```
storyforge/
├── index.html              ← The entire app in one file
├── manifest.json           ← PWA manifest
├── README.md               ← This file
├── .well-known/
│   └── assetlinks.json     ← Android TWA verification
└── storyforge-twa/         ← Android Studio project
    ├── app/
    ├── build.gradle
    ├── Start Story Forge.bat
    └── PUBLISHING_GUIDE.md
```

---

## ❓ FAQ

**Is it free?**
The app itself is completely free. Cloud AI providers charge per use (Gemini has a free tier). Ollama is 100% free.

**Does it work offline?**
Yes — if you use Ollama. Cloud AI requires internet.

**Can I use my own AI model?**
Yes — with Ollama you can type any model name (e.g. `gemma3`, `mistral`, `phi3`).

**Will my story be saved?**
Stories are saved in your browser session. Refreshing the page will clear them — copy your chapters before closing!

**Can I publish this to the Play Store?**
Yes! Follow the [`PUBLISHING_GUIDE.md`](storyforge-twa/PUBLISHING_GUIDE.md).

---

## 🙏 Credits

Built with ❤️ using:
- [Ollama](https://ollama.com) for local AI
- [Anthropic Claude](https://anthropic.com) for cloud AI
- [Google Fonts](https://fonts.google.com) — Playfair Display & Crimson Pro
- [Android Browser Helper](https://github.com/GoogleChrome/android-browser-helper) for TWA

---

## 📄 License

Free to use and modify for personal and commercial projects.

---

*Made with The Story Forge — where every story begins.*
