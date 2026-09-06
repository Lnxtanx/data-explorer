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

    case 'google_sheets':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn('shrink-0 drop-shadow-xs', className)}
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            fill="#EA4335"
          />
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
