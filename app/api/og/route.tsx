import { ImageResponse } from 'next/og';

async function loadGoogleFont(font: string, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);

  if (resource) {
    const response = await fetch(resource[1]);
    if (response.status === 200) {
      return await response.arrayBuffer();
    }
  }

  throw new Error('failed to load font data');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get('title')?.slice(0, 80) || 'Agent Smith';
  const subtitle = searchParams.get('subtitle') || '';
  const accent = searchParams.get('accent') || '22c55e';

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0a0a',
          padding: '60px 80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              backgroundColor: `#${accent}`,
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2L2 7L12 12L22 7L12 2Z"
                fill="#0a0a0a"
                stroke="#0a0a0a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 17L12 22L22 17"
                stroke="#0a0a0a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12L12 17L22 12"
                stroke="#0a0a0a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span
              style={{
                fontSize: '28px',
                fontFamily: 'Geist',
                color: '#71717a',
                letterSpacing: '-0.02em',
              }}
            >
              AGENT SMITH
            </span>
            <span
              style={{
                fontSize: '20px',
                fontFamily: 'Geist Mono',
                color: '#52525b',
                letterSpacing: '-0.02em',
              }}
            >
              AI Workbench
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h1
            style={{
              fontSize: '72px',
              fontFamily: 'Geist',
              fontWeight: 700,
              color: '#e5e5e5',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: '32px',
                fontFamily: 'Geist Mono',
                color: '#71717a',
                marginTop: '20px',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: `#${accent}`,
              }}
            />
            <span
              style={{
                fontSize: '18px',
                fontFamily: 'Geist Mono',
                color: '#a1a1aa',
              }}
            >
              AI Agent
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Geist',
          data: await loadGoogleFont('Geist', title + 'AGENT SMITH'),
          style: 'normal',
        },
        {
          name: 'Geist Mono',
          data: await loadGoogleFont('Geist Mono', title + 'AI Agent'),
          style: 'normal',
        },
      ],
    }
  );
}
