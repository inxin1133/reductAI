import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function LogoNaver({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path d="M15.5608 12.7042L8.14667 2H2V22H8.43833V11.2967L15.8533 22H22V2H15.5608V12.7042Z" 
       fill="currentColor" className="text-lime-500"/>
    </svg>
  )
}

