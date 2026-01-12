import type { MarkSpec } from "prosemirror-model"

// Text color mark: stores a Tailwind class key like "red-500" and renders a span with the corresponding class. 
// NOTE: We rely on a fixed palette in the UI so Tailwind can include the needed classes at build time.
// 텍스트 색상 마크: Tailwind 클래스 키(예: "red-500")를 저장하고 해당 클래스를 가진 span 태그로 렌더링합니다. 
// 참고: 빌드 시 Tailwind가 필요한 클래스를 포함할 수 있도록 UI에서 고정된 팔레트를 사용합니다.
export const textColorMarkSpec: MarkSpec = {
  attrs: {
    color: { default: "" }, // e.g. "red-500"
  },
  inclusive: true,
  parseDOM: [
    {
      tag: "span[data-text-color]",
      getAttrs: (dom) => ({
        color: (dom as HTMLElement).getAttribute("data-text-color") || "",
      }),
    },
  ],
  toDOM: (mark) => {
    const color = String((mark.attrs as any)?.color || "")
    const cls = color ? `text-${color}` : ""
    return ["span", { "data-text-color": color, class: cls }, 0]
  },
}

