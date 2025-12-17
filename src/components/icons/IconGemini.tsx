import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function IconGemini({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <path 
        d="M22.9956 12.0198C20.1412 12.1944 17.4492 13.4073 15.427 15.4299C13.4048 17.4525 12.1922 20.145 12.0176 23H11.9736C11.6216 17.0984 6.8993 12.3763 1 12.0198V11.9758C6.8993 11.6237 11.6216 6.90048 11.978 1H12.022C12.3784 6.90048 17.1007 11.6237 23 11.9802V12.0198H22.9956Z" 
        fill="currentColor"              
        className={className}
      />
    </svg>
  )
}

