# Third party software

Marked 17.0.5 is bundled as public/vendor/marked.mjs. Source: https://github.com/markedjs/marked . The MIT license is preserved at public/vendor/marked-LICENSE.md. Roundtable uses the lexer and constructs its own restricted DOM tree.

PDF.js 5.6.205 legacy browser builds are bundled as public/vendor/pdf.min.mjs and pdf.worker.min.mjs, together with standard_fonts, cmaps and wasm assets. Source: https://github.com/mozilla/pdf.js . Apache-2.0 license: public/vendor/pdfjs-LICENSE.txt. Asset-specific licenses are retained in their directories. The compatibility build supplies polyfills needed by older engines; dynamic JavaScript evaluation is disabled. CSP permits WebAssembly decoding for supported PDF image codecs.
