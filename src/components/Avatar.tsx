import type { Avatar as AvatarT } from '../lib/types';

export function Avatar({ avatar, size = 40, className = '' }: { avatar: AvatarT; size?: number; className?: string }) {
  const style = { width: size, height: size, borderRadius: Math.max(4, size * 0.08) };
  if (avatar.kind === 'image') {
    return <img className={`avatar ${className}`} src={avatar.data} style={style} alt="" draggable={false} />;
  }
  return (
    <div className={`avatar avatar-emoji ${className}`} style={{ ...style, background: avatar.bg }}>
      <span style={{ fontSize: size * 0.58 }}>{avatar.emoji}</span>
    </div>
  );
}
