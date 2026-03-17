"use strict";

(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function parseStoredIndex(key, fallback) {
    const raw = safeStorageGet(key);
    if (raw === null) {
      return fallback;
    }

    const value = parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  function format3(value) {
    return String(value).padStart(3, "0");
  }

  function hashToUint32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normaliseStudentInput(value) {
    return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function createStudentKeyApi(config, state, dom) {
    if (!config) {
      return null;
    }

    const inputEl = $(config.inputId || "student-id-input");
    const buttonEl = $(config.buttonId || "set-student-btn");
    const displayEl = $(config.displayId || "student-key");
    const inlineSelector = config.inlineSelector || ".student-key-inline";
    const storageKey = config.storageKey;
    const seedPrefix = config.seedPrefix || "ESCAPE";

    function computeKeyNumber(studentText) {
      const seed = hashToUint32(seedPrefix + "|" + studentText);
      const rng = mulberry32(seed);
      return Math.floor(rng() * 900) + 100;
    }

    function getStoredStudent() {
      const raw = safeStorageGet(storageKey);
      if (!raw) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }

    function setStoredStudent(student) {
      safeStorageSet(storageKey, JSON.stringify(student));
    }

    function renderInlineKey() {
      if (!dom.lockQuestionEl) {
        return;
      }

      const text = Number.isFinite(state.studentKeyNum) ? format3(state.studentKeyNum) : "---";
      dom.lockQuestionEl.querySelectorAll(inlineSelector).forEach((element) => {
        element.textContent = text;
      });
    }

    function syncDisplay() {
      if (displayEl) {
        displayEl.textContent = Number.isFinite(state.studentKeyNum) ? format3(state.studentKeyNum) : "---";
      }
    }

    function hydrateFromStorage() {
      const stored = getStoredStudent();
      if (stored && stored.text && Number.isFinite(stored.keyNum)) {
        state.studentKeyNum = stored.keyNum;
        if (inputEl) {
          inputEl.value = stored.text;
        }
      } else {
        state.studentKeyNum = null;
      }

      syncDisplay();
    }

    function applyStudent() {
      if (!inputEl) {
        return;
      }

      const text = normaliseStudentInput(inputEl.value);
      if (!text) {
        return;
      }

      state.studentKeyNum = computeKeyNumber(text);
      setStoredStudent({ text, keyNum: state.studentKeyNum });
      syncDisplay();

      if (config.resetOnChange) {
        state.currentIndex = 0;
        safeStorageRemove(state.storageKey);
      }

      if (typeof config.onSet === "function") {
        config.onSet(state.studentKeyNum, state);
      }

      state.showCurrent();
    }

    if (buttonEl) {
      buttonEl.addEventListener("click", applyStudent);
    }

    hydrateFromStorage();

    return {
      renderInlineKey,
      ensureReady() {
        syncDisplay();
        return Number.isFinite(state.studentKeyNum);
      }
    };
  }

  function createFooterApi(config, state, dom) {
    if (!config || !dom.footerQuoteEl || !dom.footerNoteEl) {
      return null;
    }

    const mode = config.mode || "index";
    let footerIndex = mode === "persistent" && config.storageKey
      ? parseStoredIndex(config.storageKey, 0)
      : 0;

    function currentMessage(lockIndex) {
      if (!config.messages || config.messages.length === 0) {
        return null;
      }

      const index = mode === "persistent"
        ? footerIndex % config.messages.length
        : lockIndex % config.messages.length;

      return config.messages[index];
    }

    function render(lockIndex) {
      const message = currentMessage(lockIndex);
      if (!message) {
        return;
      }

      dom.footerQuoteEl.textContent = message.quote || "";
      dom.footerNoteEl.textContent = message.note || "";
    }

    function advance() {
      if (mode !== "persistent") {
        return;
      }

      const doUpdate = function () {
        footerIndex += 1;
        if (config.storageKey) {
          safeStorageSet(config.storageKey, String(footerIndex));
        }
        render(state.currentIndex);
      };

      if (config.fadeClass && dom.footerEl) {
        dom.footerEl.classList.add(config.fadeClass);
        window.setTimeout(function () {
          doUpdate();
          dom.footerEl.classList.remove(config.fadeClass);
        }, config.fadeDuration || 150);
      } else {
        doUpdate();
      }
    }

    function reset() {
      footerIndex = 0;
      if (config.storageKey) {
        safeStorageRemove(config.storageKey);
      }
      render(state.currentIndex);
    }

    function renderFinal() {
      if (config.finalQuote) {
        dom.footerQuoteEl.textContent = config.finalQuote;
      }
      if (config.finalNote) {
        dom.footerNoteEl.textContent = config.finalNote;
      }
    }

    return {
      render,
      advance,
      reset,
      renderFinal
    };
  }

  window.EscapeRoom = {
    init: function init(config) {
      const dom = {
        lockTitleEl: $("lock-title"),
        lockBadgeEl: $("lock-badge"),
        lockStoryEl: $("lock-story"),
        lockQuestionEl: $("lock-question"),
        codeInputEl: $("code-input"),
        submitBtn: $("submit-btn"),
        resetBtn: $("reset-btn"),
        feedbackEl: $("feedback"),
        progressTextEl: $("progress-text"),
        progressBarFill: $("progress-bar-fill"),
        lockCardEl: $("lock-card"),
        finalMessageEl: $("final-message"),
        restartBtn: $("restart-btn"),
        footerEl: $("footer"),
        footerQuoteEl: $("footer-quote"),
        footerNoteEl: $("footer-note")
      };

      const state = {
        locks: config.locks || [],
        storageKey: config.storageKey,
        currentIndex: parseStoredIndex(config.storageKey, 0),
        studentKeyNum: null,
        saveProgress() {
          safeStorageSet(state.storageKey, String(state.currentIndex));
        },
        clearProgress() {
          safeStorageRemove(state.storageKey);
        },
        showCurrent() {}
      };

      if (state.currentIndex > state.locks.length) {
        state.currentIndex = 0;
      }

      const studentKeyApi = createStudentKeyApi(config.studentKey, state, dom);
      const footerApi = createFooterApi(config.footer, state, dom);
      const totalLocks = config.totalLocks || state.locks.length;
      const confettiOptions = config.confetti === false ? null : (config.confetti || {
        particleCount: 120,
        spread: 70,
        origin: { y: 0.7 }
      });

      function setFeedback(text, className) {
        if (!dom.feedbackEl) {
          return;
        }

        dom.feedbackEl.textContent = text || "";
        dom.feedbackEl.className = className ? "feedback " + className : "feedback";
      }

      function updateProgress() {
        const currentDisplay = Math.min(state.currentIndex + 1, totalLocks);
        dom.progressTextEl.textContent = "Lock " + currentDisplay + " of " + totalLocks;
        dom.progressBarFill.style.width = ((state.currentIndex / totalLocks) * 100) + "%";
      }

      function expectedCode(lock) {
        if (typeof config.codeResolver === "function") {
          return config.codeResolver(lock, {
            format3,
            studentKeyNum: state.studentKeyNum,
            state
          });
        }

        const rawCode = lock.code !== undefined ? lock.code : lock.baseCode;
        return format3(rawCode);
      }

      function showLock(index) {
        const lock = state.locks[index];
        if (!lock) {
          return;
        }

        dom.lockTitleEl.textContent = lock.title;
        dom.lockStoryEl.textContent = lock.story;
        dom.lockQuestionEl.innerHTML = lock.questionHtml;
        dom.lockBadgeEl.textContent = lock.badgeText || "Code: 3 digits";

        if (studentKeyApi) {
          studentKeyApi.renderInlineKey();
        }

        dom.codeInputEl.value = "";
        dom.codeInputEl.disabled = false;
        dom.submitBtn.disabled = false;

        setFeedback("", "");

        dom.lockCardEl.style.display = "block";
        dom.finalMessageEl.style.display = "none";

        updateProgress();
        if (footerApi) {
          footerApi.render(index);
        }

        if (typeof config.onShowLock === "function") {
          config.onShowLock(lock, { dom, state, format3 });
        }

        dom.codeInputEl.focus();
      }

      function showFinal() {
        dom.lockCardEl.style.display = "none";
        dom.finalMessageEl.style.display = "block";
        dom.progressTextEl.textContent = config.finalProgressText || "Complete";
        dom.progressBarFill.style.width = "100%";

        if (footerApi) {
          footerApi.renderFinal();
        }

        if (typeof config.onShowFinal === "function") {
          config.onShowFinal({ dom, state });
        }
      }

      function normaliseCodeInput(value) {
        if (typeof config.normaliseCodeInput === "function") {
          return config.normaliseCodeInput(value);
        }

        return (value || "").replace(/\s+/g, "");
      }

      function checkCode() {
        const rawInput = dom.codeInputEl.value;
        const input = normaliseCodeInput(rawInput);
        const lock = state.locks[state.currentIndex];

        if (typeof config.beforeCheck === "function") {
          const result = config.beforeCheck({
            input,
            rawInput,
            lock,
            dom,
            state,
            setFeedback,
            format3
          });

          if (result === false) {
            return;
          }
        }

        if (!input) {
          setFeedback(config.emptyCodeMessage || "Enter a 3-digit code before submitting.", "error");
          return;
        }

        if (!/^\d{3}$/.test(input)) {
          setFeedback(config.invalidCodeMessage || "Codes must be exactly 3 digits.", "error");
          return;
        }

        const expected = expectedCode(lock);
        const overrideCode = typeof config.finalOverrideCode === "function"
          ? config.finalOverrideCode(lock, state)
          : config.finalOverrideCode;
        const isFinalLock = state.currentIndex === state.locks.length - 1;
        const isMatch = input === expected || (isFinalLock && overrideCode && input === overrideCode);

        if (!isMatch) {
          setFeedback(config.incorrectCodeMessage || "Incorrect code. Check your working and try again.", "error");
          dom.codeInputEl.select();
          return;
        }

        setFeedback(config.successMessage || "Correct code! Lock opened.", "success");
        dom.codeInputEl.disabled = true;
        dom.submitBtn.disabled = true;

        if (footerApi && config.footer && config.footer.advanceOnCorrect) {
          footerApi.advance();
        }

        if (confettiOptions && typeof window.confetti === "function") {
          window.confetti(confettiOptions);
        }

        window.setTimeout(function () {
          state.currentIndex += 1;
          state.saveProgress();

          if (state.currentIndex >= state.locks.length) {
            showFinal();
          } else {
            showLock(state.currentIndex);
          }
        }, config.successDelay || 700);
      }

      function resetProgress() {
        const message = config.resetConfirmMessage || "Reset all progress and go back to Lock 1?";
        if (!window.confirm(message)) {
          return;
        }

        state.currentIndex = 0;
        state.clearProgress();

        if (footerApi) {
          footerApi.reset();
        }

        if (typeof config.onReset === "function") {
          config.onReset({ dom, state });
        }

        showLock(state.currentIndex);
      }

      state.showCurrent = function () {
        if (state.currentIndex >= state.locks.length) {
          showFinal();
        } else {
          showLock(state.currentIndex);
        }
      };

      dom.submitBtn.addEventListener("click", checkCode);
      dom.resetBtn.addEventListener("click", resetProgress);
      if (dom.restartBtn) {
        dom.restartBtn.addEventListener("click", resetProgress);
      }
      dom.codeInputEl.addEventListener("keyup", function (event) {
        if (event.key === "Enter") {
          checkCode();
        }
      });

      if (studentKeyApi) {
        studentKeyApi.ensureReady();
      }

      state.showCurrent();
      return state;
    }
  };
})();
