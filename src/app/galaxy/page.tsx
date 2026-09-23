import type { Metadata, Viewport } from 'next';
import { GalaxyExperience } from '@/components/galaxy/GalaxyExperience';
import { evolutionLines, getDataset } from '@/lib/data';
import { galaxyData } from '@/lib/galaxy';

export const metadata: Metadata = {
  title: 'The AI Galaxy',
  description: 'Every AI model as a star: labs as spiral arms, evolution lines as constellations, and a timeline that shows the field exploding. Fly through it.',
  alternates: { canonical: '/galaxy/' },
};

export const viewport: Viewport = { themeColor: '#010208' };

export default function GalaxyPage() {
  const data = getDataset();
  return <GalaxyExperience data={galaxyData(data.models, data.labs, evolutionLines(), data.updatedAt)} />;
}
