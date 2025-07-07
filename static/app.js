/**
 * YouTube Transcript Extractor - Frontend JavaScript
 *
 * Handles transcript fetching, processing, display, and user interactions
 * with mobile-responsive design and accessibility features.
 */

// Global state management
let currentTranscript = null;
let activeTab = "timestamps";
let updateTimeout = null; // Debouncing for text edits

// DOM element references for performance
const elements = {
  urlInput: document.getElementById("urlInput"),
  getTranscriptBtn: document.getElementById("getTranscript"),
  buttonText: document.getElementById("buttonText"),
  errorDiv: document.getElementById("error"),
  loading: document.getElementById("loading"),
  videoSection: document.getElementById("videoSection"),
  videoContainer: document.getElementById("videoContainer"),
  transcriptSection: document.getElementById("transcriptSection"),
  timestampsTab: document.getElementById("timestampsTab"),
  plainTab: document.getElementById("plainTab"),
  timestampsContent: document.getElementById("timestampsContent"),
  plainContent: document.getElementById("plainContent"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  transcriptStats: document.getElementById("transcriptStats"),
};

/**
 * Initialize event listeners when DOM is ready
 */
document.addEventListener("DOMContentLoaded", function () {
  setupEventListeners();
  // Focus on input for better UX
  if (elements.urlInput) {
    elements.urlInput.focus();
  }
});

/**
 * Set up all event listeners for the application
 */
function setupEventListeners() {
  // Main action button
  elements.getTranscriptBtn?.addEventListener("click", fetchTranscript);

  // Enter key support for input
  elements.urlInput?.addEventListener("keypress", handleInputKeyPress);

  // Tab switching
  elements.timestampsTab?.addEventListener("click", () =>
    switchTab("timestamps")
  );
  elements.plainTab?.addEventListener("click", () => switchTab("plain"));

  // Action buttons
  elements.copyBtn?.addEventListener("click", copyTranscript);
  elements.downloadBtn?.addEventListener("click", downloadTranscript);

  // Keyboard navigation for tabs
  elements.timestampsTab?.addEventListener("keydown", handleTabKeydown);
  elements.plainTab?.addEventListener("keydown", handleTabKeydown);
}

/**
 * Handle Enter key press in URL input
 */
function handleInputKeyPress(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    fetchTranscript();
  }
}

/**
 * Handle keyboard navigation for tabs (ARIA compliance)
 */
function handleTabKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.target.click();
  }
}

/**
 * Main function to fetch and process transcript from server
 */
async function fetchTranscript() {
  const url = elements.urlInput?.value?.trim();

  // Input validation
  if (!url) {
    showError("Please enter a YouTube URL");
    return;
  }

  if (!isValidYouTubeUrl(url)) {
    showError("Please enter a valid YouTube URL");
    return;
  }

  setLoadingState(true);
  hideError();

  try {
    // Make API request to Flask backend
    const response = await fetch("/api/transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch transcript");
    }

    // Store transcript data globally
    currentTranscript = data;

    // Update UI with new transcript
    displayVideo(data.videoId);
    displayTranscriptStats(data.stats);
    displayTranscript();

    // Log success for debugging
    console.log("Transcript loaded successfully:", {
      videoId: data.videoId,
      chunks: data.chunks.length,
      words: data.stats.totalWords,
    });
  } catch (error) {
    console.error("Transcript fetch error:", error);
    showError(error.message || "Could not fetch transcript. Please try again.");
  } finally {
    setLoadingState(false);
  }
}

/**
 * Validate YouTube URL format
 */
function isValidYouTubeUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)/,
    /^(youtube\.com\/watch\?v=|youtu\.be\/)/,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

/**
 * Display YouTube video in embedded player
 */
function displayVideo(videoId) {
  if (!elements.videoContainer || !videoId) return;

  elements.videoContainer.innerHTML = `
        <iframe 
            src="https://www.youtube.com/embed/${videoId}?rel=0" 
            frameborder="0" 
            allowfullscreen
            loading="lazy"
            title="YouTube video player"
            class="w-full h-full"
        ></iframe>
    `;

  elements.videoSection?.classList.remove("hidden");
}

/**
 * Display transcript statistics in the UI
 */
function displayTranscriptStats(stats) {
  if (!elements.transcriptStats || !stats) return;

  const { totalChunks, totalWords, duration } = stats;
  const durationStr = formatTimestamp(duration);

  elements.transcriptStats.textContent = `${totalChunks} sections • ${totalWords} words • ${durationStr}`;
}

/**
 * Display complete transcript immediately (no lazy loading)
 */
function displayTranscript() {
  if (!currentTranscript) return;

  // Clear existing content
  if (elements.timestampsContent) elements.timestampsContent.innerHTML = "";
  if (elements.plainContent) elements.plainContent.innerHTML = "";

  // Create document fragments for efficient DOM manipulation
  const timestampsFragment = document.createDocumentFragment();
  const plainFragment = document.createDocumentFragment();

  // Load ALL chunks at once
  currentTranscript.chunks.forEach((chunk, chunkIndex) => {
    timestampsFragment.appendChild(createTimestampChunk(chunk, chunkIndex));
    plainFragment.appendChild(createPlainChunk(chunk, chunkIndex));
  });

  // Append to DOM in single operation
  elements.timestampsContent?.appendChild(timestampsFragment);
  elements.plainContent?.appendChild(plainFragment);

  // Show transcript section
  elements.transcriptSection?.classList.remove("hidden");
}

/**
 * Create a timestamp-enabled chunk element
 */
function createTimestampChunk(chunk, chunkIndex) {
  const chunkDiv = document.createElement("div");
  chunkDiv.className =
    "transcript-chunk chunk-container border border-white/10 rounded-sm p-3 sm:p-4";

  // Chunk header with metadata
  const header = document.createElement("div");
  header.className =
    "flex items-center gap-2 mb-3 text-gray-400 text-xs sm:text-sm";
  header.innerHTML = `
        <button 
            onclick="jumpToTime(${chunk.entries[0].start})" 
            class="hover:text-white transition-colors flex items-center gap-1"
            title="Jump to ${chunk.startTime} in video"
            aria-label="Jump to ${chunk.startTime} in video"
        >
            <i class="fas fa-play text-xs" aria-hidden="true"></i>
            ${chunk.startTime}
        </button>
        <span aria-hidden="true">•</span>
        <span>${chunk.entries.length} segment${
    chunk.entries.length !== 1 ? "s" : ""
  }</span>
    `;

  // Individual transcript entries
  const content = document.createElement("div");
  content.className = "space-y-2";

  chunk.entries.forEach((entry, entryIndex) => {
    const entryDiv = document.createElement("div");
    entryDiv.className = "flex gap-2 sm:gap-3 group";

    entryDiv.innerHTML = `
            <button 
                onclick="jumpToTime(${entry.start})"
                class="text-gray-500 hover:text-gray-300 font-mono text-xs min-w-[45px] sm:min-w-[50px] text-left transition-colors flex items-center gap-1 flex-shrink-0"
                title="Jump to ${entry.timestamp}"
                aria-label="Jump to ${entry.timestamp}"
            >
                <i class="fas fa-play text-xs" aria-hidden="true"></i>
                ${entry.timestamp}
            </button>
            <p 
                contenteditable="true"
                class="text-white leading-relaxed flex-1 focus:outline-none focus:bg-white/5 rounded-sm px-1 py-1 text-sm sm:text-base"
                onblur="updateTranscriptEntry(${chunkIndex}, ${entryIndex}, this.textContent)"
                onkeydown="handleTextEdit(event)"
                role="textbox"
                aria-label="Editable transcript text"
            >
                ${escapeHtml(entry.text)}
            </p>
        `;

    content.appendChild(entryDiv);
  });

  chunkDiv.appendChild(header);
  chunkDiv.appendChild(content);
  return chunkDiv;
}

/**
 * Create a plain text chunk element
 */
function createPlainChunk(chunk, chunkIndex) {
  const chunkDiv = document.createElement("div");
  chunkDiv.className =
    "transcript-chunk chunk-container border border-white/10 rounded-sm p-3 sm:p-4";

  // Chunk header
  const header = document.createElement("div");
  header.className =
    "flex items-center gap-2 mb-3 text-gray-400 text-xs sm:text-sm";
  header.innerHTML = `
        <button 
            onclick="jumpToTime(${chunk.entries[0].start})" 
            class="hover:text-white transition-colors flex items-center gap-1"
            title="Jump to ${chunk.startTime} in video"
            aria-label="Jump to ${chunk.startTime} in video"
        >
            <i class="fas fa-play text-xs" aria-hidden="true"></i>
            ${chunk.startTime}
        </button>
    `;

  // Editable text content
  const textArea = document.createElement("div");
  textArea.contentEditable = true;
  textArea.className =
    "text-white leading-relaxed focus:outline-none focus:bg-white/5 rounded-sm p-2 min-h-[60px] text-sm sm:text-base";
  textArea.textContent = chunk.text;
  textArea.setAttribute("role", "textbox");
  textArea.setAttribute("aria-label", "Editable transcript text");

  // Event listeners for text editing
  textArea.addEventListener("blur", () =>
    updateChunkText(chunkIndex, textArea.textContent)
  );
  textArea.addEventListener("keydown", handleTextEdit);

  chunkDiv.appendChild(header);
  chunkDiv.appendChild(textArea);
  return chunkDiv;
}

/**
 * Switch between timestamp and plain text views
 */
function switchTab(tab) {
  activeTab = tab;

  // Update tab styling and ARIA attributes
  if (tab === "timestamps") {
    elements.timestampsTab.className =
      "flex-1 py-2 px-3 sm:px-4 rounded-sm bg-white text-black font-medium text-sm sm:text-base";
    elements.plainTab.className =
      "flex-1 py-2 px-3 sm:px-4 rounded-sm text-gray-400 hover:text-white transition-colors text-sm sm:text-base";

    elements.timestampsTab.setAttribute("aria-selected", "true");
    elements.plainTab.setAttribute("aria-selected", "false");

    elements.timestampsContent?.classList.remove("hidden");
    elements.plainContent?.classList.add("hidden");
  } else {
    elements.plainTab.className =
      "flex-1 py-2 px-3 sm:px-4 rounded-sm bg-white text-black font-medium text-sm sm:text-base";
    elements.timestampsTab.className =
      "flex-1 py-2 px-3 sm:px-4 rounded-sm text-gray-400 hover:text-white transition-colors text-sm sm:text-base";

    elements.plainTab.setAttribute("aria-selected", "true");
    elements.timestampsTab.setAttribute("aria-selected", "false");

    elements.timestampsContent?.classList.add("hidden");
    elements.plainContent?.classList.remove("hidden");
  }
}

/**
 * Update individual transcript entry with debouncing
 */
function updateTranscriptEntry(chunkIndex, entryIndex, newText) {
  if (!currentTranscript?.chunks?.[chunkIndex]?.entries?.[entryIndex]) return;

  // Debounce updates to prevent excessive processing
  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    currentTranscript.chunks[chunkIndex].entries[entryIndex].text =
      newText.trim();
    updateDerivedData();
  }, 500);
}

/**
 * Update entire chunk text with debouncing
 */
function updateChunkText(chunkIndex, newText) {
  if (!currentTranscript?.chunks?.[chunkIndex]) return;

  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    currentTranscript.chunks[chunkIndex].text = newText.trim();
    updateDerivedData();
  }, 500);
}

/**
 * Update derived data after edits (plain chunks, full text)
 */
function updateDerivedData() {
  if (!currentTranscript) return;

  // Update plain chunks and full text
  currentTranscript.plainChunks = currentTranscript.chunks.map(
    (chunk) => chunk.text
  );
  currentTranscript.withoutTimestamps = currentTranscript.plainChunks.join(" ");

  // Update withTimestamps array for compatibility
  currentTranscript.withTimestamps = [];
  currentTranscript.chunks.forEach((chunk) => {
    chunk.entries.forEach((entry) => {
      currentTranscript.withTimestamps.push(entry);
    });
  });
}

/**
 * Handle text editing keyboard shortcuts
 */
function handleTextEdit(event) {
  // Save on Enter (without Shift)
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.target.blur();
  }
  // Escape to cancel editing
  if (event.key === "Escape") {
    event.target.blur();
  }
}

/**
 * Jump to specific time in YouTube video
 */
window.jumpToTime = function (seconds) {
  if (!currentTranscript?.videoId) return;

  const videoUrl = `https://youtube.com/watch?v=${
    currentTranscript.videoId
  }&t=${Math.floor(seconds)}s`;
  window.open(videoUrl, "_blank", "noopener,noreferrer");
};

// Make update functions available globally for inline event handlers
window.updateTranscriptEntry = updateTranscriptEntry;

/**
 * Copy entire transcript to clipboard - FIXED VERSION
 */
async function copyTranscript() {
  if (!currentTranscript) {
    showError("No transcript available to copy");
    return;
  }

  let text;

  try {
    // Always copy the complete transcript regardless of what's currently displayed
    if (activeTab === "timestamps") {
      // Create timestamped version from all chunks
      text = currentTranscript.chunks
        .map((chunk) =>
          chunk.entries
            .map((entry) => `${entry.timestamp}: ${entry.text}`)
            .join("\n")
        )
        .join("\n\n");
    } else {
      // Create plain text version from all chunks
      text = currentTranscript.chunks.map((chunk) => chunk.text).join("\n\n");
    }

    // Use the Clipboard API
    await navigator.clipboard.writeText(text);
    showCopySuccess();
  } catch (error) {
    console.error("Failed to copy:", error);

    // Fallback method for older browsers
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      showCopySuccess();
    } catch (fallbackError) {
      console.error("Fallback copy failed:", fallbackError);
      showError(
        "Failed to copy to clipboard. Please try selecting and copying manually."
      );
    }
  }
}

/**
 * Show copy success feedback
 */
function showCopySuccess() {
  if (!elements.copyBtn) return;

  const originalContent = elements.copyBtn.innerHTML;
  elements.copyBtn.innerHTML =
    '<i class="fas fa-check" aria-hidden="true"></i>Copied!';
  elements.copyBtn.disabled = true;

  setTimeout(() => {
    elements.copyBtn.innerHTML = originalContent;
    elements.copyBtn.disabled = false;
  }, 2000);
}

/**
 * Download transcript as text file
 */
function downloadTranscript() {
  if (!currentTranscript) return;

  let text;
  let filename;

  if (activeTab === "timestamps") {
    text = currentTranscript.chunks
      .map((chunk) =>
        chunk.entries
          .map((entry) => `${entry.timestamp}: ${entry.text}`)
          .join("\n")
      )
      .join("\n\n");
    filename = `transcript_${currentTranscript.videoId}_with_timestamps.txt`;
  } else {
    text = currentTranscript.chunks.map((chunk) => chunk.text).join("\n\n");
    filename = `transcript_${currentTranscript.videoId}_plain_text.txt`;
  }

  // Add metadata header
  const header = `YouTube Transcript Extract\nVideo ID: ${
    currentTranscript.videoId
  }\nExtracted: ${new Date().toLocaleString()}\n${"=".repeat(50)}\n\n`;
  const fullContent = header + text;

  // Create and trigger download
  const blob = new Blob([fullContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up object URL
  URL.revokeObjectURL(url);
}

/**
 * Format seconds to readable timestamp
 */
function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Set loading state for UI
 */
function setLoadingState(isLoading) {
  if (isLoading) {
    elements.loading?.classList.remove("hidden");
    if (elements.getTranscriptBtn) {
      elements.getTranscriptBtn.disabled = true;
      elements.getTranscriptBtn.classList.add("opacity-50");
    }
    if (elements.buttonText) {
      elements.buttonText.textContent = "Loading...";
    }
  } else {
    elements.loading?.classList.add("hidden");
    if (elements.getTranscriptBtn) {
      elements.getTranscriptBtn.disabled = false;
      elements.getTranscriptBtn.classList.remove("opacity-50");
    }
    if (elements.buttonText) {
      elements.buttonText.textContent = "Get Transcript";
    }
  }
}

/**
 * Show error message to user
 */
function showError(message) {
  if (!elements.errorDiv) return;

  elements.errorDiv.textContent = message;
  elements.errorDiv.classList.remove("hidden");

  // Auto-hide error after 10 seconds
  setTimeout(() => {
    hideError();
  }, 10000);
}

/**
 * Hide error message
 */
function hideError() {
  elements.errorDiv?.classList.add("hidden");
}
