import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function CardVisa({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg"  width="24" height="24" viewBox="0 0 48 32" fill="none" className={className} {...props}>
      <svg viewBox="0 0 48 32" className="h-5 w-7" fill="none">
        <rect width="48" height="32" rx="4" fill="#1a1f71" />
        <text x="24" y="21" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial,sans-serif">VISA</text>
      </svg>
    </svg>
  )
}
