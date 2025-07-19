import React from "react";

const CompassIcon = ({ width = 28, height = 28, className = "" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <g clipPath="url(#clip0_2148_341)">
        <path
          d="M12 0C5.373 0 0 5.373 0 12C0 18.627 5.373 24 12 24C18.627 24 24 18.6278 24 12C24 5.373 18.627 0 12 0ZM15.405 12.0007C15.405 13.8097 13.9897 15.276 12.2078 15.3855L8.08875 18.9412L7.5525 18.6307L8.9175 13.4272C8.70654 12.9812 8.59618 12.4942 8.59425 12.0007C8.59425 10.1917 10.0095 8.7255 11.7907 8.616L15.9113 5.06025L16.4475 5.36925L15.0825 10.5743C15.285 11.0092 15.4058 11.49 15.4058 12.0015L15.405 12.0007ZM10.452 12C10.452 12.4106 10.6151 12.8043 10.9054 13.0946C11.1957 13.3849 11.5894 13.548 12 13.548C12.4106 13.548 12.8043 13.3849 13.0946 13.0946C13.3849 12.8043 13.548 12.4106 13.548 12C13.548 11.5894 13.3849 11.1957 13.0946 10.9054C12.8043 10.6151 12.4106 10.452 12 10.452C11.5894 10.452 11.1957 10.6151 10.9054 10.9054C10.6151 11.1957 10.452 11.5894 10.452 12Z"
          fill="url(#paint0_linear_2148_341)"
        />
      </g>
      <defs>
        <linearGradient
          id="paint0_linear_2148_341"
          x1="24"
          y1="12"
          x2="-2.07194"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#E3066E" />
          <stop offset="1" stop-color="white" />
        </linearGradient>
        <clipPath id="clip0_2148_341">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

export default CompassIcon;
