import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function CardMaster({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 32" fill="none" className={className} {...props}>
      <svg viewBox="0 0 48 32" className="h-5 w-7" fill="none">
        <circle cx="18" cy="16" r="10" fill="#EB001B" />
        <circle cx="30" cy="16" r="10" fill="#F79E1B" />
        <path d="M24 8.68a10 10 0 010 14.64 10 10 0 000-14.64z" fill="#FF5F00" />
      </svg>
    </svg>
  )
}
