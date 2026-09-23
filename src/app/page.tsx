import { Binder } from '@/components/binder/Binder';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { Guide } from '@/components/Guide';
import { Hero } from '@/components/Hero';
import { formatDate } from '@/lib/format';
import { getDataset, newestModels, stats } from '@/lib/data';

export default function Home() {
  const data = getDataset();
  const labs = Object.fromEntries(data.labs.map((l) => [l.key, l]));
  const s = stats();
  const refDate = data.updatedAt;
  const setName = new Date(refDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <Hero newest={newestModels(3)} labs={labs} setSize={data.models.length} refDate={refDate} setName={setName} stats={s} />
        <Binder models={data.models} labs={data.labs} setSize={data.models.length} refDate={refDate} />
        <Guide
          listings={data.source.listings}
          providers={data.source.providers}
          updatedLabel={formatDate(refDate.slice(0, 10))}
          licensesFromHf={data.models.filter((m) => m.origin === 'models.dev' && m.license.source === 'huggingface').length}
          openWeights={data.models.filter((m) => m.origin === 'models.dev' && m.openWeights).length}
          hubCards={data.models.filter((m) => m.origin === 'huggingface').length}
          hubOrgs={data.source.hub.orgs}
          hubRepos={data.source.hub.repos}
          rated={s.rated}
        />
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}
