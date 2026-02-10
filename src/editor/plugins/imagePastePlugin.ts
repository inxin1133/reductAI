import { Plugin } from "prosemirror-state"
import { DOMParser as PMDOMParser, type Schema } from "prosemirror-model"

const ASSET_PATH_RE = /^\/api\/ai\/media\/assets\/[0-9a-f-]{36}/i

const normalizeAssetPath = (raw: string) => {
  const value = String(raw || "").trim()
  if (!value) return ""
  try {
    const u = new URL(value, window.location.href)
    return u.pathname
  } catch {
    return value.split("?")[0]
  }
}

export function imagePastePlugin(schema: Schema) {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const data = event.clipboardData
        if (!data) return false
        const html = data.getData("text/html")
        const text = data.getData("text/plain") || ""

        let doc: Document | null = null
        if (html) {
          try {
            const parser = new DOMParser()
            doc = parser.parseFromString(html, "text/html")
          } catch {
            doc = null
          }
          if (doc) {
            const imgs = Array.from(doc.querySelectorAll("img"))
            if (imgs.length) {
              const imgPaths = imgs
                .map((img) => normalizeAssetPath(img.getAttribute("src") || ""))
                .filter((p) => ASSET_PATH_RE.test(p))
              if (imgPaths.length) {
                for (const img of imgs) {
                  const normalized = normalizeAssetPath(img.getAttribute("src") || "")
                  if (ASSET_PATH_RE.test(normalized)) {
                    img.setAttribute("src", normalized)
                  }
                }

                const textPath = normalizeAssetPath(text)
                if (textPath && !ASSET_PATH_RE.test(textPath) && !imgPaths.includes(textPath)) {
                  return false
                }

                const pmParser = PMDOMParser.fromSchema(schema)
                const slice = pmParser.parseSlice(doc.body, { preserveWhitespace: true })
                view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
                return true
              }
            }
          }
        }

        const textPath = normalizeAssetPath(text)
        if (!textPath || !ASSET_PATH_RE.test(textPath)) return false

        const wrapper = document.createElement("div")
        const img = document.createElement("img")
        img.setAttribute("src", textPath)
        wrapper.appendChild(img)
        const pmParser = PMDOMParser.fromSchema(schema)
        const slice = pmParser.parseSlice(wrapper, { preserveWhitespace: true })
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
      },
    },
  })
}
