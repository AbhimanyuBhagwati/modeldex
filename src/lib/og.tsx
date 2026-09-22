import { ImageResponse } from 'next/og';
import { artToSvg, cardArt } from '@/lib/art';
import { mix } from '@/lib/color';
import { getDataset, getLab, newestModels } from '@/lib/data';
import { ACCESS_LABEL, RARITY_LABEL, formatPrice, formatTokens, typeLine } from '@/lib/format';
import type { LabSummary, Model } from '@/lib/types';

/** Share images, 1200 by 630, rendered at build time into real .png files. */
export const OG_SIZE = { width: 1200, height: 630 };
const size = OG_SIZE;

export function renderHomeOg() {
  const data = getDataset();
  const fan = newestModels(3);
  const angles = [-12, 0, 12];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 80px', background: '#0d0f15', color: '#eceef4' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, fontWeight: 800 }}>
            <div style={{ width: 20, height: 28, borderRadius: 4, background: '#f5c542', transform: 'rotate(-9deg)' }} />
            Modeldex
          </div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>{`Every model from ${data.labs.length} AI labs, dealt as a card.`}</div>
          <div style={{ fontSize: 26, color: '#a8aebe' }}>
            {`${data.models.length} cards · compare side by side · updated daily`}
          </div>
        </div>
        <div style={{ display: 'flex', position: 'relative', flex: 1, height: 460, alignItems: 'center', justifyContent: 'center' }}>
          {[fan[1], fan[0], fan[2]].map((m, i) => {
            if (!m) return null;
            const c = getLab(m.lab).color;
            return (
              <div
                key={m.key}
                style={{
                  position: 'absolute',
                  width: 200,
                  height: 280,
                  display: 'flex',
                  padding: 8,
                  borderRadius: 14,
                  transform: `translateX(${(i - 1) * 90}px) rotate(${angles[i]}deg)`,
                  background: `linear-gradient(155deg, ${mix(c, '#ffffff', 0.34)}, ${c} 40%, ${mix(c, '#000000', 0.3)})`,
                  boxShadow: '0 24px 48px rgba(0,0,0,.6)',
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 8, background: '#fbfaf6', color: '#17181c' }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, color: mix(c, '#000000', 0.4) }}>{getLab(m.lab).name.toUpperCase()}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.05 }}>{m.name}</div>
                  <img alt="" width={168} height={100} style={{ borderRadius: 6 }} src={`data:image/svg+xml;base64,${Buffer.from(artToSvg(cardArt(m, c), 168, 100)).toString('base64')}`} />
                  <div style={{ fontSize: 13, color: '#5b5e67' }}>{`${formatTokens(m.context)} context`}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    size,
  );
}

export function renderModelOg(m: Model, lab: LabSummary) {
  const t = lab.color;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 64, padding: '0 80px', background: '#0d0f15', color: '#eceef4' }}>
        <div
          style={{
            width: 330,
            height: 462,
            display: 'flex',
            padding: 12,
            borderRadius: 22,
            transform: 'rotate(-4deg)',
            background: `linear-gradient(155deg, ${mix(t, '#ffffff', 0.34)}, ${t} 40%, ${mix(t, '#000000', 0.3)})`,
            boxShadow: '0 30px 60px rgba(0,0,0,.55)',
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px', borderRadius: 13, background: '#fbfaf6', color: '#17181c' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 200 }}>
                <div style={{ fontSize: 13, letterSpacing: 1.5, color: mix(t, '#000000', 0.4) }}>{lab.name.toUpperCase()}</div>
                <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.05 }}>{m.name}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, color: mix(t, '#000000', 0.45) }}>
                <span style={{ fontSize: 12 }}>CTX</span>
                <span style={{ fontSize: 30, fontWeight: 800 }}>{formatTokens(m.context)}</span>
              </div>
            </div>
            <img
              alt=""
              width={270}
              height={162}
              style={{ borderRadius: 8 }}
              src={`data:image/svg+xml;base64,${Buffer.from(artToSvg(cardArt(m, t), 270, 162)).toString('base64')}`}
            />
            <div style={{ display: 'flex', alignSelf: 'center', fontSize: 12, letterSpacing: 1.5, padding: '5px 12px', borderRadius: 99, background: mix(t, '#fbfaf6', 0.85), color: mix(t, '#000000', 0.48) }}>
              {typeLine(m).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #e2e1dc' }}>
              {[
                ['Input', m.price?.input],
                ['Output', m.price?.output],
              ].map(([k, v]) => (
                <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e1dc', fontSize: 18 }}>
                  <span style={{ fontWeight: 700 }}>{k}</span>
                  <span>{formatPrice((v as number | null | undefined) ?? null)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, color: '#a8aebe' }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: t }} />
            <span>{`${lab.name} · ${RARITY_LABEL[m.rarity]} · ${ACCESS_LABEL[m.access]}`}</span>
          </div>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>{m.name}</div>
          <div style={{ fontSize: 26, color: '#a8aebe', lineHeight: 1.35 }}>
            {[m.context && `${formatTokens(m.context)} context`, m.price?.output != null && `${formatPrice(m.price.output)} per 1M output tokens`, m.license.name].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24, fontSize: 24, fontWeight: 700 }}>
            <div style={{ width: 18, height: 24, borderRadius: 4, background: '#f5c542', transform: 'rotate(-9deg)' }} />
            Modeldex
          </div>
        </div>
      </div>
    ),
    size,
  );
}
