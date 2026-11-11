/**
 * Small syntax highlighter for slide sources (JSX/TSX) in the source view.
 * Returns a list of [className, text] tokens. className is null for plain text.
 * It knows only what slide files contain: line comments, JSX tags, attributes,
 * strings and {expressions}. Everything else stays plain text.
 */

const STRING = /^("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/;
const NUMBER = /^-?\d+(\.\d+)?/;
const WORD = /^[A-Za-z_$][\w$.-]*/;
const KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'const', 'let', 'return', 'export', 'import', 'from', 'function']);

export function highlight(src) {
  const out = [];
  let i = 0;
  const push = (cls, text) => {
    const last = out[out.length - 1];
    if (last && last[0] === cls) last[1] += text;
    else out.push([cls, text]);
  };
  const atLineStart = () => /(^|\n)[ \t]*$/.test(src.slice(Math.max(0, i - 200), i));

  /** {expression}: strings, numbers, keywords, nested braces. */
  function expression() {
    let depth = 0;
    while (i < src.length) {
      const rest = src.slice(i);
      const ch = src[i];
      if (rest.startsWith('/*')) {
        const end = src.indexOf('*/', i + 2);
        const stop = end < 0 ? src.length : end + 2;
        push('hl-comment', src.slice(i, stop));
        i = stop;
        continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      if (ch === '}' || ch === ']' || ch === ')') {
        depth--;
        if (depth === 0) {
          push('hl-punct', ch);
          i++;
          return;
        }
      }
      if (ch === '<' && /^<[A-Za-z>]/.test(rest) && /[(,{[?:>&|]\s*$/.test(src.slice(Math.max(0, i - 50), i))) {
        element();
        continue;
      }
      let m;
      if ((m = STRING.exec(rest))) push('hl-string', m[0]);
      else if ((m = NUMBER.exec(rest))) push('hl-number', m[0]);
      else if ((m = WORD.exec(rest))) push(KEYWORDS.has(m[0]) ? 'hl-keyword' : null, m[0]);
      else push('{}[](),:=>'.includes(ch) ? 'hl-punct' : null, ch);
      i += m ? m[0].length : 1;
    }
  }

  /** <Tag attr="x" other={…}> or </Tag>. Returns 'open', 'close' or 'self'. */
  function tag() {
    const open = src[i + 1] === '/' ? '</' : '<';
    push('hl-punct', open);
    i += open.length;
    const name = WORD.exec(src.slice(i));
    if (name) {
      push(/^[A-Z]/.test(name[0]) ? 'hl-component' : 'hl-tag', name[0]);
      i += name[0].length;
    }
    while (i < src.length) {
      const rest = src.slice(i);
      let m;
      if (rest.startsWith('/>')) {
        push('hl-punct', '/>');
        i += 2;
        return 'self';
      }
      if (src[i] === '>') {
        push('hl-punct', '>');
        i++;
        return open === '</' ? 'close' : 'open';
      }
      if (src[i] === '{') expression();
      else if ((m = STRING.exec(rest))) push('hl-string', m[0]), (i += m[0].length);
      else if ((m = WORD.exec(rest))) push('hl-attr', m[0]), (i += m[0].length);
      else push(src[i] === '=' ? 'hl-punct' : null, src[i]), i++;
    }
    return 'self';
  }

  /** One JSX element inside an expression, with its children. */
  function element() {
    let depth = 0;
    while (i < src.length) {
      if (/^<[A-Za-z/>]/.test(src.slice(i))) {
        const kind = tag();
        depth += kind === 'open' ? 1 : kind === 'close' ? -1 : 0;
        if (depth <= 0) return;
      } else if (src[i] === '{') expression();
      else {
        const m = /^[^<{]+|^./.exec(src.slice(i));
        push(null, m[0]);
        i += m[0].length;
      }
    }
  }

  while (i < src.length) {
    const rest = src.slice(i);
    if (rest.startsWith('//') && atLineStart()) {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      push('hl-comment', src.slice(i, stop));
      i = stop;
    } else if (rest.startsWith('{/*')) {
      const end = src.indexOf('*/}', i);
      const stop = end < 0 ? src.length : end + 3;
      push('hl-comment', src.slice(i, stop));
      i = stop;
    } else if (/^<[A-Za-z/>]/.test(rest)) {
      tag();
    } else if (src[i] === '{') {
      expression();
    } else {
      const m = /^[^<{/]+|^./.exec(rest);
      push(null, m[0]);
      i += m[0].length;
    }
  }
  return out;
}
