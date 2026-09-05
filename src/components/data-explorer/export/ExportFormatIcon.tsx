import React from 'react';
import { cn } from '@/lib/utils';
import type { ExportFormat } from '@/lib/api/data/explorer/types';

interface ExportFormatIconProps {
  format: ExportFormat;
  className?: string;
  size?: number;
}

export function ExportFormatIcon({ format, className, size = 24 }: ExportFormatIconProps) {
  switch (format) {
    case 'excel':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn('shrink-0 drop-shadow-xs', className)}
        >
          {/* File body */}
          <rect x="5" y="3" width="22" height="26" rx="3.5" fill="#107C41" />
          <path
            d="M19 3L27 11H21.5C20.12 11 19 9.88 19 8.5V3Z"
            fill="#159C52"
          />
          {/* Subtle page fold highlight */}
          <rect x="7" y="14" width="18" height="13" rx="1.5" fill="#0E6435" opacity="0.6" />
          {/* Excel Grid lines */}
          <line x1="7" y1="18.5" x2="25" y2="18.5" stroke="#4ADE80" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="7" y1="23" x2="25" y2="23" stroke="#4ADE80" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="16" y1="14" x2="16" y2="27" stroke="#4ADE80" strokeWidth="1" strokeOpacity="0.4" />
          {/* Excel X Badge */}
          <rect x="7" y="6" width="10" height="7" rx="1.5" fill="#22C55E" />
          <text
            x="12"
            y="11.5"
            fill="#FFFFFF"
            fontSize="6.5"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
          >
            XLS
          </text>
        </svg>
      );

    case 'json':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn('shrink-0 drop-shadow-xs', className)}
        >
          {/* File body */}
          <rect x="5" y="3" width="22" height="26" rx="3.5" fill="#F59E0B" />
          <path
            d="M19 3L27 11H21.5C20.12 11 19 9.88 19 8.5V3Z"
            fill="#FBBF24"
          />
          {/* Code Container */}
          <rect x="7" y="14" width="18" height="13" rx="1.5" fill="#B45309" opacity="0.65" />
          {/* Curly brackets { } */}
          <text
            x="16"
            y="23.5"
            fill="#FEF08A"
            fontSize="10"
            fontWeight="900"
            fontFamily="monospace, Consolas, Courier New"
            textAnchor="middle"
          >
            {'{ }'}
          </text>
          {/* JSON Badge */}
          <rect x="7" y="6" width="10" height="7" rx="1.5" fill="#D97706" />
          <text
            x="12"
            y="11.5"
            fill="#FFFFFF"
            fontSize="5.5"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
          >
            JSON
          </text>
        </svg>
      );

    case 'csv':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn('shrink-0 drop-shadow-xs', className)}
        >
          {/* File body */}
          <rect x="5" y="3" width="22" height="26" rx="3.5" fill="#059669" />
          <path
            d="M19 3L27 11H21.5C20.12 11 19 9.88 19 8.5V3Z"
            fill="#10B981"
          />
          {/* CSV Data table lines */}
          <rect x="7" y="14" width="18" height="13" rx="1.5" fill="#047857" opacity="0.65" />
          <circle cx="10.5" cy="18" r="1.2" fill="#A7F3D0" />
          <line x1="14" y1="18" x2="23" y2="18" stroke="#A7F3D0" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="10.5" cy="23" r="1.2" fill="#A7F3D0" />
          <line x1="14" y1="23" x2="21" y2="23" stroke="#A7F3D0" strokeWidth="1.5" strokeLinecap="round" />
          {/* CSV Badge */}
          <rect x="7" y="6" width="10" height="7" rx="1.5" fill="#10B981" />
          <text
            x="12"
            y="11.5"
            fill="#FFFFFF"
            fontSize="6"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
          >
            CSV
          </text>
        </svg>
      );

    case 'ndjson':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn('shrink-0 drop-shadow-xs', className)}
        >
          {/* File body */}
          <rect x="5" y="3" width="22" height="26" rx="3.5" fill="#7C3AED" />
          <path
            d="M19 3L27 11H21.5C20.12 11 19 9.88 19 8.5V3Z"
            fill="#9333EA"
          />
          {/* Streaming lines container */}
          <rect x="7" y="14" width="18" height="13" rx="1.5" fill="#581C87" opacity="0.65" />
          {/* Stacked lines representing line-delimited rows */}
          <text
            x="10.5"
            y="19"
            fill="#DDD6FE"
            fontSize="6"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {'{'}
          </text>
          <line x1="14" y1="17.5" x2="21" y2="17.5" stroke="#DDD6FE" strokeWidth="1.2" strokeLinecap="round" />
          <text
            x="22.5"
            y="19"
            fill="#DDD6FE"
            fontSize="6"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {'}'}
          </text>

          <text
            x="10.5"
            y="24.5"
            fill="#DDD6FE"
            fontSize="6"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {'{'}
          </text>
          <line x1="14" y1="23" x2="21" y2="23" stroke="#DDD6FE" strokeWidth="1.2" strokeLinecap="round" />
          <text
            x="22.5"
            y="24.5"
            fill="#DDD6FE"
            fontSize="6"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {'}'}
          </text>

          {/* NDJSON Badge */}
          <rect x="7" y="6" width="11" height="7" rx="1.5" fill="#8B5CF6" />
          <text
            x="12.5"
            y="11.5"
            fill="#FFFFFF"
            fontSize="4.8"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
          >
            NDJSON
          </text>
        </svg>
      );

    case 'sql':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn('shrink-0 drop-shadow-xs', className)}
        >
          {/* File body */}
          <rect x="5" y="3" width="22" height="26" rx="3.5" fill="#2563EB" />
          <path
            d="M19 3L27 11H21.5C20.12 11 19 9.88 19 8.5V3Z"
            fill="#3B82F6"
          />
          {/* SQL Terminal Container */}
          <rect x="7" y="14" width="18" height="13" rx="1.5" fill="#1E3A8A" opacity="0.7" />
          {/* Database Disk Cylinder / Prompt */}
          <ellipse cx="16" cy="18" rx="5.5" ry="1.8" fill="#93C5FD" />
          <path d="M10.5 18V21.5C10.5 22.5 13 23.3 16 23.3C19 23.3 21.5 22.5 21.5 21.5V18" fill="none" stroke="#60A5FA" strokeWidth="1.2" />
          <path d="M10.5 21V24.5C10.5 25.5 13 26.3 16 26.3C19 26.3 21.5 25.5 21.5 24.5V21" fill="none" stroke="#60A5FA" strokeWidth="1.2" />
          {/* SQL Badge */}
          <rect x="7" y="6" width="10" height="7" rx="1.5" fill="#3B82F6" />
          <text
            x="12"
            y="11.5"
            fill="#FFFFFF"
            fontSize="6"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
          >
            SQL
          </text>
        </svg>
      );

    default:
      return null;
  }
}
