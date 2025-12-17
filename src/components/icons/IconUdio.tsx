import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function IconUdio({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path d="M8.95996 22L3.12598 16.124H8.95996V22ZM21.6992 12.7236C21.6992 19.0194 16.7325 21.0552 14.249 21.2861L9.08594 16.124H12.6328C15.252 16.124 15.7247 13.8569 15.6338 12.7236V2.02051H21.6992V12.7236ZM8.98145 16.082L3 10.1006V2H8.98145V16.082Z" 
      fill="currentColor"
      className={className}
      />
    </svg>
  )
}

