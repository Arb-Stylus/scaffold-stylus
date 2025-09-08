import React from "react";

interface AngularBorderProps {
  width: number;
  height: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const AngularBorder: React.FC<AngularBorderProps> = ({
  width,
  height,
  color = "#FD0077",
  className = "",
  style = {},
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={className}
      style={{
        position: "absolute",
        top: "-3px",
        left: 0,
        pointerEvents: "none",
        ...style,
      }}
    >
      <path
        d={`M${width - 20}.132 0.5L${width - 1}.5 ${height / 2}.2109V${height - 1}.5H19.0811L0.5 ${height / 2}.7871V0.5H${width - 20}.132Z`}
        stroke={color}
        strokeWidth="1"
      />
    </svg>
  );
};
