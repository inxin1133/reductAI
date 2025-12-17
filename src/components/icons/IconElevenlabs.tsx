import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function IconElevenlabs({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" className={className} {...props}>
  <path d="M6 2V22H10V2H6ZM13.9984 2V22H18V2H13.9984Z"
   fill="currentColor"
   className={className}
  />
</svg>
  )
}


