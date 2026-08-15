/**
 * KLOD Design System — Holistic Input Controller
 *
 * Handles: text, file upload, audio recording, images, URLs
 * Auto-parses pasted URLs from text content.
 *
 * Usage:
 *   import { HolisticInput } from '../design-system/holistic-input.js';
 *   const input = new HolisticInput(document.querySelector('.holistic-input'), {
 *     onSubmit: (data) => console.log(data),
 *     accept: '*',            // file types to accept
 *     maxFileSizeMB: 25,      // max file size
 *     enableAudio: true,      // show mic button
 *     enableImages: true,     // show image button
 *     enableFiles: true,      // show file attach button
 *     enableUrls: true,       // auto-detect URLs
 *   });
 */

export class HolisticInput {
  constructor(el, options = {}) {
    this.el = el;
    this.options = {
      onSubmit: options.onSubmit || (() => {}),
      onChange: options.onChange || (() => {}),
      accept: options.accept || '*',
      maxFileSizeMB: options.maxFileSizeMB || 25,
      enableAudio: options.enableAudio !== false,
      enableImages: options.enableImages !== false,
      enableFiles: options.enableFiles !== false,
      enableUrls: options.enableUrls !== false,
      placeholder: options.placeholder || 'Type, paste, or drop anything...',
    };

    this.items = []; // { type: 'file'|'image'|'audio'|'url', name, data, file? }
    this.mediaRecorder = null;
    this.isRecording = false;

    this._bind();
  }

  _bind() {
    // Elements
    this.textarea = this.el.querySelector('.holistic-input-text');
    this.preview = this.el.querySelector('.holistic-input-preview');
    this.fileInput = this.el.querySelector('.holistic-input-file');
    this.submitBtn = this.el.querySelector('.holistic-input-submit');

    if (this.textarea) {
      this.textarea.placeholder = this.options.placeholder;
      this.textarea.addEventListener('input', () => this._onTextChange());
      this.textarea.addEventListener('paste', (e) => this._onPaste(e));
      this.textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          this._submit();
        }
      });
    }

    // File input
    if (this.fileInput) {
      this.fileInput.accept = this.options.accept;
      this.fileInput.addEventListener('change', (e) => this._onFileSelect(e));
    }

    // Action buttons
    this.el.querySelectorAll('.holistic-input-action').forEach(btn => {
      const action = btn.dataset.action;
      if (action === 'file' || action === 'attach') {
        btn.addEventListener('click', () => this.fileInput?.click());
      } else if (action === 'image') {
        btn.addEventListener('click', () => {
          if (this.fileInput) {
            this.fileInput.accept = 'image/*';
            this.fileInput.click();
            // Reset accept after
            setTimeout(() => { this.fileInput.accept = this.options.accept; }, 500);
          }
        });
      } else if (action === 'audio' || action === 'mic') {
        btn.addEventListener('click', () => this._toggleRecording(btn));
      } else if (action === 'url') {
        btn.addEventListener('click', () => this._promptUrl());
      }
    });

    // Submit
    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', () => this._submit());
    }

    // Drag & drop
    this.el.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.el.classList.add('dragover');
    });
    this.el.addEventListener('dragleave', () => {
      this.el.classList.remove('dragover');
    });
    this.el.addEventListener('drop', (e) => {
      e.preventDefault();
      this.el.classList.remove('dragover');
      this._handleFiles(e.dataTransfer.files);
    });
  }

  // --- Text change: detect URLs ---
  _onTextChange() {
    if (this.options.enableUrls) {
      this._detectUrls();
    }
    this.options.onChange(this.getData());
  }

  // --- Paste: handle images and files ---
  _onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === 'file') {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) this._addFile(file);
      }
    }
  }

  // --- File selection ---
  _onFileSelect(e) {
    this._handleFiles(e.target.files);
    e.target.value = ''; // reset
  }

  _handleFiles(files) {
    for (const file of files) {
      if (file.size > this.options.maxFileSizeMB * 1024 * 1024) {
        console.warn(`File ${file.name} exceeds ${this.options.maxFileSizeMB}MB limit`);
        continue;
      }
      this._addFile(file);
    }
  }

  _addFile(file) {
    const type = file.type.startsWith('image/') ? 'image' :
                 file.type.startsWith('audio/') ? 'audio' : 'file';
    const item = {
      id: crypto.randomUUID(),
      type,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      file,
      data: null,
    };

    // Read as data URL for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      item.data = e.target.result;
      this.options.onChange(this.getData());
    };
    reader.readAsDataURL(file);

    this.items.push(item);
    this._renderPreview();
  }

  // --- URL detection ---
  _detectUrls() {
    if (!this.textarea) return;
    const text = this.textarea.value;
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const found = text.match(urlRegex) || [];

    // Remove old auto-detected URLs
    this.items = this.items.filter(i => i.type !== 'url' || i.manual);

    found.forEach(url => {
      if (!this.items.some(i => i.name === url)) {
        this.items.push({
          id: crypto.randomUUID(),
          type: 'url',
          name: url,
          data: url,
          manual: false,
        });
      }
    });

    this._renderPreview();
  }

  _promptUrl() {
    const url = prompt('Enter URL:');
    if (url && url.trim()) {
      this.items.push({
        id: crypto.randomUUID(),
        type: 'url',
        name: url.trim(),
        data: url.trim(),
        manual: true,
      });
      this._renderPreview();
      this.options.onChange(this.getData());
    }
  }

  // --- Audio recording ---
  async _toggleRecording(btn) {
    if (this.isRecording) {
      this.mediaRecorder?.stop();
      this.isRecording = false;
      btn.classList.remove('recording');
      btn.setAttribute('aria-label', 'Record audio');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
        this._addFile(file);
        stream.getTracks().forEach(t => t.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      btn.classList.add('recording');
      btn.setAttribute('aria-label', 'Stop recording');
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }

  // --- Preview rendering ---
  _renderPreview() {
    if (!this.preview) return;

    if (this.items.length === 0) {
      this.preview.classList.remove('has-items');
      this.preview.innerHTML = '';
      return;
    }

    this.preview.classList.add('has-items');

    // Icon SVGs (inline, no emojis)
    const icons = {
      file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
      image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
      audio: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>',
      url: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    };

    this.preview.innerHTML = this.items.map(item => `
      <div class="holistic-input-preview-item" data-id="${item.id}">
        ${icons[item.type] || icons.file}
        <span class="name">${this._truncate(item.name, 30)}</span>
        <span class="remove" data-remove="${item.id}" aria-label="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
      </div>
    `).join('');

    // Bind remove buttons
    this.preview.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.remove;
        this.items = this.items.filter(i => i.id !== id);
        this._renderPreview();
        this.options.onChange(this.getData());
      });
    });
  }

  _truncate(str, max) {
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
  }

  // --- Submit ---
  _submit() {
    const data = this.getData();
    if (!data.text && data.items.length === 0) return;
    this.options.onSubmit(data);
  }

  // --- Public API ---

  getData() {
    return {
      text: this.textarea?.value || '',
      items: this.items.map(i => ({
        id: i.id,
        type: i.type,
        name: i.name,
        size: i.size || null,
        mimeType: i.mimeType || null,
        data: i.data,
        file: i.file || null,
      })),
    };
  }

  clear() {
    if (this.textarea) this.textarea.value = '';
    this.items = [];
    this._renderPreview();
  }

  destroy() {
    if (this.isRecording) {
      this.mediaRecorder?.stop();
    }
  }
}

export default HolisticInput;
