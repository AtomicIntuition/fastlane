import Image from 'next/image';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

interface TeamLogoProps {
  abbreviation: string;
  teamName?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function TeamLogo({
  abbreviation,
  teamName,
  size = 64,
  className = '',
  style,
}: TeamLogoProps) {
  return (
    <Image
      src={getTeamLogoUrl(abbreviation)}
      alt={teamName ?? abbreviation}
      width={size}
      height={size}
      className={className}
      style={style}
      unoptimized
    />
  );
}
