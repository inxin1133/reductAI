import React from "react"

type IconProps = React.SVGProps<SVGSVGElement>

export function IconPika({ className, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" className={className} {...props}>
  <path 
    d="M19.9105 19H10.2506C10.075 16.9429 7.68928 15.7143 6.5184 15.3571V15.5714C8.62602 16.2571 9.44565 18.1429 9.59201 19H1.68842C-1.12174 10.4286 5.34748 7.57143 8.93337 7.21429C9.81154 9.95714 12.5192 10.5 13.7633 10.4286V10.2143H13.5438C9.50416 9.87143 8.64062 5.92857 8.7138 4C9.59198 4.42857 12.4461 5.07143 17.9346 7.42857C22.3255 9.31429 23.1305 12.2143 22.9842 13.4286C19.8227 14.8 18.5933 16.8571 18.3737 17.7143L19.9105 19Z"
    fill="currentColor"
    className={className}
  />
</svg>
  )
}

