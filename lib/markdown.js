/*!
 * Markdown Browser — GFM Parser
 * Parses GitHub Flavored Markdown to HTML
 */

const Markdown = (() => {

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  // ── Inline parser ──────────────────────────────────────────

  function parseInline(src) {
    if (!src) return '';
    let out = '';

    while (src.length) {
      let m;

      // Escape
      m = /^\\([\\`*_{}\[\]()#+\-.!~=|])/.exec(src);
      if (m) { out += escapeHtml(m[1]); src = src.slice(m[0].length); continue; }

      // Code span
      m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(src) || /^(`+)\s*([\s\S]*?[^`])\s*\1(?!`)/.exec(src);
      if (m) {
        const code = m[2] !== undefined ? m[2] : m[1];
        out += `<code>${escapeHtml(code.replace(/\uE003/g, ' ').trim())}</code>`;
        src = src.slice(m[0].length); continue;
      }

      // Wiki-link  [[Page Name|Optional Alias]]
      m = /^\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/.exec(src);
      if (m) {
        const target = m[1].trim();
        const label  = m[2] ? m[2].trim() : target;
        out += `<a class="wiki-link" data-wikilink="${escapeHtml(target)}" href="#">${escapeHtml(label)}</a>`;
        src = src.slice(m[0].length); continue;
      }

      // Image (before link)
      m = /^!\[([^\]]*)\]\(([^)\s"']+)(?:\s+"([^"]+)")?\)/.exec(src);
      if (m) {
        const alt = escapeHtml(m[1]);
        const href = escapeHtml(m[2]);
        const title = m[3] ? ` title="${escapeHtml(m[3])}"` : '';
        out += `<img src="${href}" alt="${alt}"${title} loading="lazy">`;
        src = src.slice(m[0].length); continue;
      }

      // Link
      m = /^\[([^\]]+)\]\(([^)\s"']+)(?:\s+"([^"]+)")?\)/.exec(src);
      if (m) {
        const text = parseInline(m[1]);
        const href = escapeHtml(m[2]);
        const title = m[3] ? ` title="${escapeHtml(m[3])}"` : '';
        const external = /^https?:\/\//.test(m[2]) ? ' target="_blank" rel="noopener"' : '';
        out += `<a href="${href}"${title}${external}>${text}</a>`;
        src = src.slice(m[0].length); continue;
      }

      // Autolink
      m = /^<(https?:\/\/[^\s>]+)>/.exec(src);
      if (m) {
        out += `<a href="${escapeHtml(m[1])}" target="_blank" rel="noopener">${escapeHtml(m[1])}</a>`;
        src = src.slice(m[0].length); continue;
      }

      // Email autolink
      m = /^<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/.exec(src);
      if (m) {
        out += `<a href="mailto:${escapeHtml(m[1])}">${escapeHtml(m[1])}</a>`;
        src = src.slice(m[0].length); continue;
      }

      // Bold + Italic (triple)
      m = /^\*{3}([\s\S]+?)\*{3}/.exec(src) || /^_{3}([\s\S]+?)_{3}/.exec(src);
      if (m) {
        out += `<strong><em>${parseInline(m[1])}</em></strong>`;
        src = src.slice(m[0].length); continue;
      }

      // Bold
      m = /^\*{2}([\s\S]+?)\*{2}/.exec(src) || /^_{2}([^_\n]+?)_{2}/.exec(src);
      if (m) {
        out += `<strong>${parseInline(m[1])}</strong>`;
        src = src.slice(m[0].length); continue;
      }

      // Italic
      m = /^\*([^*\n]+?)\*(?!\*)/.exec(src) || /^_([^_\n]+?)_(?!_)/.exec(src);
      if (m) {
        out += `<em>${parseInline(m[1])}</em>`;
        src = src.slice(m[0].length); continue;
      }

      // Strikethrough
      m = /^~~([\s\S]+?)~~/.exec(src);
      if (m) {
        out += `<del>${parseInline(m[1])}</del>`;
        src = src.slice(m[0].length); continue;
      }

      // Highlight
      m = /^==([\s\S]+?)==/.exec(src);
      if (m) {
        out += `<mark>${parseInline(m[1])}</mark>`;
        src = src.slice(m[0].length); continue;
      }

      // Hard line break
      m = /^ {2,}\n|\\\n/.exec(src);
      if (m) { out += '<br>\n'; src = src.slice(m[0].length); continue; }

      // Consume up to next special char
      m = /^[\s\S]+?(?=[\\`*_{}\[\]!<>=~]|~~|==| {2,}\n|\\\n|$)/.exec(src);
      if (m) { out += escapeHtml(m[0]); src = src.slice(m[0].length); continue; }

      out += escapeHtml(src[0]);
      src = src.slice(1);
    }

    return out;
  }

  // ── Front matter ────────────────────────────────────────────

  function parseFrontMatter(yaml) {
    const data = {};
    const lines = yaml.split('\n');
    for (const line of lines) {
      const m = /^([\w-]+)\s*:\s*(.*)/.exec(line.trim());
      if (!m) continue;
      let val = m[2].trim();
      if (/^\[.*\]$/.test(val)) {
        try { val = JSON.parse(val.replace(/'/g, '"')); } catch (_) {}
      } else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
      else val = val.replace(/^["']|["']$/g, '');
      data[m[1]] = val;
    }
    return data;
  }

  function renderFrontMatter(data) {
    if (!data || !Object.keys(data).length) return '';
    const rows = Object.entries(data).map(([k, v]) => {
      let valHtml;
      if (Array.isArray(v)) {
        valHtml = v.map(t => `<span class="frontmatter-tag">${escapeHtml(String(t))}</span>`).join(' ');
      } else {
        valHtml = `<span class="frontmatter-val">${escapeHtml(String(v))}</span>`;
      }
      return `<span class="frontmatter-key">${escapeHtml(k)}</span>${valHtml}`;
    });
    return `<div class="frontmatter-panel"><h4>Front Matter</h4><div class="frontmatter-grid">${rows.join('')}</div></div>`;
  }

  // ── Callout helpers ─────────────────────────────────────────

  const CALLOUT_TYPES = /^(NOTE|TIP|INFO|WARNING|CAUTION|DANGER|IMPORTANT|SUCCESS|QUESTION|FAILURE|BUG|EXAMPLE|QUOTE)$/i;

  function getCalloutIcon(type) {
    const t = type.toLowerCase();
    if (t === 'note' || t === 'info')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7.5 7v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.5" cy="4.75" r="0.75" fill="currentColor"/></svg>';
    if (t === 'tip' || t === 'success')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 7.5l2 2 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (t === 'warning' || t === 'caution')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M7.5 2L14 13H1L7.5 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.5 6v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.5" cy="10.75" r="0.75" fill="currentColor"/></svg>';
    if (t === 'danger' || t === 'failure' || t === 'bug')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 5l5 5M10 5l-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    if (t === 'important')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7.5 4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.5" cy="10.5" r="0.75" fill="currentColor"/></svg>';
    if (t === 'question')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 5.5a2 2 0 013.3 1.5c0 1.5-1.3 1.5-1.3 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7.5" cy="11" r="0.75" fill="currentColor"/></svg>';
    if (t === 'example')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M2 4h11M2 7.5h7M2 11h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    if (t === 'quote')
      return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><path d="M3 7h3v3H3V7zM9 7h3v3H9V7zM3 7c0-2 1-3 3-3M9 7c0-2 1-3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<svg width="14" height="14" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7.5 7v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.5" cy="4.75" r="0.75" fill="currentColor"/></svg>';
  }

  // ── List parser ─────────────────────────────────────────────

  const LIST_MARKER = /^( {0,3})([*+\-]|\d{1,9}[.)])( +|$)/;
  const HR_LINE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
  const SETEXT_LINE = /^ {0,3}=+[ \t]*$/;
  const FENCE = /^ {0,3}(`{3,}|~{3,})/;
  const LAZY_STOP = /^ *(?:#{1,6}(?:[ \t]|$)|```|~~~|>|\|)/;
  const TASK = /^\[([xX ])\](?:[ \t]+|(?=\n)|$)/;
  // Private-use characters survive escapeHtml and inline parsing, so they mark spots to fill in later.
  const PARA_OPEN = '\uE000', PARA_CLOSE = '\uE001', TASK_BOX = '\uE002', HARD_BREAK = '\uE003';
  const expandTabs = line => { let out = ''; for (const ch of line) out += ch === '\t' ? ' '.repeat(4 - out.length % 4) : ch; return out; };
  const listKind = m => /\d/.test(m[2]) ? m[2].slice(-1) : m[2];
  const listStart = src => { const line = /^[^\n]*/.exec(src)[0]; return !HR_LINE.test(line) && LIST_MARKER.exec(line); };

  // Reads one list from the top of src, following CommonMark's item rules:
  // a line belongs to the open item when indented to its content column,
  // a same-style marker to the left of that column starts a sibling,
  // and an unindented line continues the item only as lazy paragraph text.
  function readList(src) {
    const lines = src.split('\n');
    const kind = listKind(listStart(src));
    const items = [];
    let cur = null, fence = null, prevBlank = false, prevPara = false, loose = false, end = 0;

    const track = text => {
      // A nested marker line counts as whatever block follows its marker.
      const lm = !fence && !HR_LINE.test(text) && LIST_MARKER.exec(text);
      if (lm) return track(text.slice(lm[0].length));
      const f = FENCE.exec(text);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !text.slice(f[0].length).trim()) fence = null;
        prevPara = false;
      } else if (f) {
        fence = f[1]; prevPara = false;
      } else {
        prevPara = !!text.trim() && !/^ {4}/.test(text) && !LAZY_STOP.test(text) && !HR_LINE.test(text) && !SETEXT_LINE.test(text);
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim() ? lines[i] : '';
      if (!line) {
        if (!cur) break;
        // An item that starts with a blank line can't also be followed by one; it stays empty.
        if (cur.lines.length === 1 && !cur.lines[0]) cur.closed = true;
        cur.lines.push(''); prevBlank = true; prevPara = false; continue;
      }
      const indent = /^ */.exec(line)[0].length;
      if (cur && !cur.closed && indent >= cur.indent) {
        let text = line.slice(cur.indent);
        // Deeply indented text right after a paragraph line still continues that paragraph.
        if (prevPara && !fence && /^ {4}/.test(text) && !LIST_MARKER.test(text.trimStart()) && !LAZY_STOP.test(text)) text = text.trimStart();
        track(text); cur.lines.push(text); end = i + 1; prevBlank = false; continue;
      }
      const m = !HR_LINE.test(line) && LIST_MARKER.exec(line);
      if (m && listKind(m) === kind) {
        if (cur && prevBlank) loose = true;
        const pad = !line.slice(m[0].length).trim() || m[3].length > 4 ? 1 : m[3].length;
        cur = { indent: m[1].length + m[2].length + pad, lines: [] };
        const text = line.slice(Math.min(cur.indent, line.length)).trim() ? line.slice(cur.indent) : '';
        fence = null; track(text); cur.lines.push(text); items.push(cur); end = i + 1; prevBlank = false; continue;
      }
      if (cur && !cur.closed && !prevBlank && prevPara && !fence && !m && !LAZY_STOP.test(line) && !HR_LINE.test(line)) {
        cur.lines.push(line.trimStart()); end = i + 1; continue;
      }
      break;
    }

    const text = lines.slice(0, end).join('\n') + (end < lines.length ? '\n' : '');
    for (const item of items) {
      let body = item.lines.join('\n').replace(/\s+$/, '');
      item.task = TASK.exec(body);
      // The box sits in front of the item's first paragraph, which also keeps "# x" after it as text.
      if (item.task) body = TASK_BOX + body.slice(item.task[0].length);
      // Block rules such as tables and setext headings expect each line to end in a newline
      const r = parse(body + '\n', false, true);
      item.html = r.html.trim();
      // A blank line between an item's own blocks makes the list loose; gaps inside nested blocks don't count.
      if (r.gap) loose = true;
    }
    return { text, items, loose };
  }

  function renderList(src, list, bi = -1) {
    const first = listStart(src);
    const ordered = /\d/.test(first[2]);
    const start = ordered ? parseInt(first[2], 10) : 1;
    const tag = ordered ? 'ol' : 'ul';
    const biAttr = bi >= 0 ? ` data-bi="${bi}"` : '';
    const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
    let out = `<${tag}${biAttr}${startAttr}>\n`;
    for (const { html, task } of list.items) {
      const inner = html
        .replace(/\uE000([\s\S]*?)\uE001/g, list.loose ? '<p>$1</p>' : '$1')
        .replace(TASK_BOX, task ? `<input type="checkbox"${task[1] !== ' ' ? ' checked' : ''} disabled> ` : '');
      out += `<li${task ? ' class="task-item"' : ''}>${inner}</li>\n`;
    }
    out += `</${tag}>\n`;
    return out;
  }

  // ── Block parser ────────────────────────────────────────────

  // topLevel = true  → add data-bi attributes and populate blocks[] for inline editing
  // topLevel = false → recursive call (blockquote body, callout body), no tracking
  // listItem = true → paragraphs are wrapped in PARA_OPEN/PARA_CLOSE so renderList can
  // emit them with or without <p> once it knows whether the list is tight
  function parse(src, topLevel = true, listItem = false) {
    // Tabs expand to 4-column stops so list content columns line up the way editors show them
    src = src.replace(/\r\n|\r/g, '\n').replace(/^.*\t.*$/gm, expandTabs);

    let html = '';
    let frontMatter = null;
    let frontMatterRaw = '';
    const headings = [];
    const blocks = [];
    let bi = 0;
    let gap = false; // a blank line separates two blocks at this level

    // Front matter
    const fmM = topLevel && /^---\n([\s\S]*?)\n---\s*\n?/.exec(src);
    if (fmM) {
      frontMatter = parseFrontMatter(fmM[1]);
      html += renderFrontMatter(frontMatter);
      if (topLevel) frontMatterRaw = fmM[0].trimEnd();
      src = src.slice(fmM[0].length);
    }

    while (src.length) {
      let m;

      // Blank lines
      m = /^\n+/.exec(src);
      if (m) { src = src.slice(m[0].length); if (html && src.trim()) gap = true; continue; }

      // ATX heading
      m = /^(#{1,6})[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?\n/.exec(src);
      if (!m) m = /^(#{1,6})[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?$/.exec(src);
      if (m) {
        const level = m[1].length;
        const raw = m[2].trim();
        const id = slugify(raw);
        const text = parseInline(raw);
        headings.push({ level, text: raw, id });
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        html += `<h${level} id="${id}"${ba}>${text}</h${level}>\n`;
        src = src.slice(m[0].length); continue;
      }

      // Fenced code block
      m = /^( {0,3})(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n? {0,3}\2[`~]*[ \t]*(?:\n|$)/.exec(src);
      if (m) {
        const infoLine = m[3].trim();
        const lang = infoLine.split(/\s+/)[0];
        const codeRaw = m[1] ? m[4].replace(new RegExp(`^ {0,${m[1].length}}`, 'gm'), '') : m[4];
        const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
        const highlighted = lang ? Highlighter.highlight(codeRaw, lang) : escapeHtml(codeRaw);
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        html += `<div class="code-block"${ba}>${langLabel}<pre><code${langClass}>${highlighted}</code></pre><button class="copy-btn" data-code="${escapeHtml(codeRaw)}">Copy</button></div>\n`;
        src = src.slice(m[0].length); continue;
      }

      // Indented code block (4 spaces)
      m = /^((?:[ ]{4}[^\n]*\n?)+)/.exec(src);
      if (m) {
        const code = m[0].replace(/^    /gm, '');
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        html += `<div class="code-block"${ba}><pre><code>${escapeHtml(code)}</code></pre></div>\n`;
        src = src.slice(m[0].length); continue;
      }

      // Blockquote (with optional Obsidian callout  > [!TYPE] Title)
      m = /^((?:>[ \t]?[^\n]*\n?)+)/.exec(src);
      if (m) {
        const inner = m[0].replace(/^>[ \t]?/gm, '').replace(/\n$/, '\n');
        const calloutM = /^\[!([\w]+)\][ \t]*(.*?)(\n[\s\S]*)?$/.exec(inner.trim());
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        if (calloutM && CALLOUT_TYPES.test(calloutM[1])) {
          const type      = calloutM[1].toLowerCase();
          const titleText = calloutM[2].trim() || calloutM[1].toUpperCase();
          const bodyRaw   = calloutM[3] ? calloutM[3].replace(/^\n/, '') : '';
          const bodyHtml  = bodyRaw.trim() ? `<div class="callout-body">${parse(bodyRaw, false).html}</div>` : '';
          html += `<div class="callout callout-${escapeHtml(type)}"${ba}><div class="callout-title">${getCalloutIcon(type)}<span>${escapeHtml(titleText)}</span></div>${bodyHtml}</div>\n`;
        } else {
          html += `<blockquote${ba}>${parse(inner, false).html}</blockquote>\n`;
        }
        src = src.slice(m[0].length); continue;
      }

      // Horizontal rule (must come before setext)
      m = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})(?:\n|$)/.exec(src);
      if (m) {
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        html += `<hr${ba}>\n`;
        src = src.slice(m[0].length); continue;
      }

      // GFM Table
      m = /^(\|.+\|[ \t]*\n)([ \t]*\|[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|[ \t]*\n)((?:\|.+\|[ \t]*\n)*)/.exec(src);
      if (!m) m = /^(.+\|.+\n)([ \t]*:?-{3,}:?(?:[ \t]*\|[ \t]*:?-{3,}:?)+[ \t]*\n)((?:.+\|.+\n)*)/.exec(src);
      if (m) {
        const parseRow = row => row.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
        const headers = parseRow(m[1]);
        const alignRow = parseRow(m[2]);
        const aligns = alignRow.map(s => {
          if (/^:.*:$/.test(s)) return 'center';
          if (/^:/.test(s)) return 'left';
          if (/:$/.test(s)) return 'right';
          return '';
        });
        const rows = m[3].trim() ? m[3].trim().split('\n').map(parseRow) : [];
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        let t = `<div class="table-wrapper"${ba}><table>\n<thead><tr>`;
        headers.forEach((h, i) => {
          const a = aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
          t += `<th${a}>${parseInline(h)}</th>`;
        });
        t += '</tr></thead>\n<tbody>\n';
        rows.forEach(row => {
          t += '<tr>';
          headers.forEach((_, i) => {
            const a = aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
            t += `<td${a}>${parseInline(row[i] ?? '')}</td>`;
          });
          t += '</tr>\n';
        });
        t += '</tbody></table></div>\n';
        html += t;
        src = src.slice(m[0].length); continue;
      }

      // List
      if (listStart(src)) {
        const list = readList(src);
        if (topLevel) blocks.push(list.text.trimEnd());
        const listBI = topLevel ? bi++ : -1;
        html += renderList(src, list, listBI);
        src = src.slice(list.text.length); continue;
      }

      // Setext heading
      m = /^([^\n]+)\n(={3,}|-{3,})[ \t]*(?:\n|$)/.exec(src);
      if (m) {
        const level = m[2][0] === '=' ? 1 : 2;
        const raw = m[1].trim();
        const id = slugify(raw);
        const text = parseInline(raw);
        headings.push({ level, text: raw, id });
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        html += `<h${level} id="${id}"${ba}>${text}</h${level}>\n`;
        src = src.slice(m[0].length); continue;
      }

      // Raw HTML block
      m = /^<(div|section|article|header|footer|nav|aside|main|details|summary|figure|figcaption|pre|table|ul|ol|h[1-6])[^>]*>[\s\S]*?<\/\1>[ \t]*\n/i.exec(src);
      if (m) { html += m[0]; src = src.slice(m[0].length); continue; }

      // Paragraph — consume until blank line or block-level element
      m = /^((?:[^\n]+\n?)+?)(?:\n{2,}|(?=#{1,6}[ \t]| {0,3}(?:```|~~~)|[ ]{4}|>[ \t]?|[ \t]*[-*+]\s|[ \t]*1[.)]\s|\|.*\||[ ]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})(?:\n|$)|$))/.exec(src);
      if (m && m[1].trim()) {
        // Hard breaks (two trailing spaces) pass through parseInline as a
        // placeholder, so emphasis that spans the break still matches
        const lines = m[1].trimEnd().replace(/ {2,}\n/g, HARD_BREAK).replace(/\n/g, ' ');
        const inline = parseInline(lines).replace(/\uE003/g, '<br>\n');
        if (topLevel) blocks.push(m[0].trimEnd());
        const ba = topLevel ? ` data-bi="${bi++}"` : '';
        if (/\n\n$/.test(m[0]) && src.slice(m[0].length).trim()) gap = true;
        html += listItem ? `${PARA_OPEN}${inline}${PARA_CLOSE}\n` : `<p${ba}>${inline}</p>\n`;
        src = src.slice(m[0].length); continue;
      }

      // Fallback: consume one line
      m = /^[^\n]+\n?/.exec(src);
      if (m) {
        if (m[0].trim()) {
          if (topLevel) blocks.push(m[0].trimEnd());
          const ba = topLevel ? ` data-bi="${bi++}"` : '';
          html += listItem ? `${PARA_OPEN}${parseInline(m[0].trim())}${PARA_CLOSE}\n` : `<p${ba}>${parseInline(m[0].trim())}</p>\n`;
        }
        src = src.slice(m[0].length); continue;
      }

      src = src.slice(1);
    }

    return { html, headings, frontMatter, blocks, frontMatterRaw, gap };
  }

  return { parse, parseInline, escapeHtml, slugify };

})();
