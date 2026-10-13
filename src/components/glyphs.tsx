export function Spinner({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`spin ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.6" opacity="0.25" />
      <path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function WeChatGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M9.1 4.1C5.4 4.4 2.5 7.1 2.5 10.4c0 1.8.9 3.4 2.3 4.5l-.6 2.2 2.4-1.2c.7.2 1.4.3 2.2.3.3 0 .6 0 .9-.1-.2-.5-.3-1.1-.3-1.7 0-3.3 3.1-6 6.9-6 .3 0 .6 0 .9.1C16.7 5.4 13.2 3.7 9.1 4.1Z"
      />
      <path
        fill="currentColor"
        d="M17.5 10.1c-3.1 0-5.6 2.1-5.6 4.7s2.5 4.7 5.6 4.7c.6 0 1.1-.1 1.6-.2l1.8 1-.4-1.6c1-.8 1.7-2 1.7-3.4 0-2.6-2.5-4.7-5.6-4.7Z"
      />
    </svg>
  )
}

export function CustomerAvatar() {
  return (
    <svg className="avatar-svg" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="18" fill="#D7E4F5" />
      <path d="M7 32c1.6-6 5.4-9 11-9s9.4 3 11 9" fill="#3E7CFF" />
      <circle cx="18" cy="15" r="6.4" fill="#F3C7A4" />
      <path d="M11.6 14.2c.6-4 2.8-6.2 6.4-6.2s5.8 2.2 6.4 6.2c-1.8-1.2-3.8-1.7-6.4-1.7s-4.6.5-6.4 1.7Z" fill="#2C333A" />
    </svg>
  )
}

export function AgentAvatar() {
  return (
    <svg className="avatar-svg" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="18" fill="#E7F3EC" />
      <rect x="17.2" y="8.2" width="1.6" height="3.6" rx="0.8" fill="#5E6C78" />
      <circle cx="18" cy="7.6" r="1.4" fill="#07C160" />
      <rect x="10.5" y="11.5" width="15" height="12" rx="4" fill="#5E6C78" />
      <circle cx="15" cy="17" r="1.4" fill="#fff" />
      <circle cx="21" cy="17" r="1.4" fill="#fff" />
      <path d="M12 25.8h12c-.2 2.6-2.6 4.2-6 4.2s-5.8-1.6-6-4.2Z" fill="#C5D4CC" />
    </svg>
  )
}

export function EmptyArt() {
  return (
    <svg className="empty-art" viewBox="0 0 96 80" aria-hidden>
      <rect x="18" y="14" width="44" height="54" rx="8" fill="currentColor" opacity="0.15" />
      <rect x="26" y="26" width="24" height="4" rx="2" fill="currentColor" opacity="0.45" />
      <rect x="26" y="36" width="28" height="4" rx="2" fill="currentColor" opacity="0.3" />
      <rect x="26" y="46" width="16" height="4" rx="2" fill="currentColor" opacity="0.3" />
      <circle cx="62" cy="50" r="14" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M72 60.5 82 70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
