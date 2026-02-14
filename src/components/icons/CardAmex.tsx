import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function CardAmex({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg"  width="24" height="24" viewBox="0 0 48 32" fill="none" className={className} {...props}>
      <svg viewBox="0 0 48 32" className="h-5 w-7" fill="none">
        <rect width="48" height="32" rx="4" fill="#006fcf" />
        <text x="24" y="20" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial,sans-serif">AMEX</text>
      </svg>
    </svg>
  )
}
