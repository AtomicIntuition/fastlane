import Image from 'next/image';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

interface TeamLogoProps {
  abbreviation: string;
  teamName?: string;
  size?: number;
  className?: string;
}

export function TeamLogo({
  abbreviation,
  teamName,
  size = 64,
  className = '',
}: TeamLogoProps) {
  return (
    <Image
      src={getTeamLogoUrl(abbreviation)}
      alt={teamName ?? abbreviation}
      width={size}
      height={size}
      className={className}
      unoptimized
    />
  );
}
