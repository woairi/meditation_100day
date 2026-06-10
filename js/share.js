// 인증 카드: canvas로 "Day N 완료" 이미지를 그려 Web Share API로 공유한다.
// 공유 미지원 환경에서는 PNG 다운로드로 대체.

function drawCard({ day, dateLabel, streak, count, total }) {
  const S = 1080;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');

  // 배경
  x.fillStyle = '#0f1420';
  x.fillRect(0, 0, S, S);

  // 진행 링
  const cx = S / 2;
  const cy = 430;
  const r = 240;
  x.lineCap = 'round';
  x.lineWidth = 26;
  x.strokeStyle = '#1a2233';
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = '#7fb8a4';
  x.beginPath();
  x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (count / total) * Math.PI * 2);
  x.stroke();

  const font = (size, weight = 400) =>
    `${weight} ${size}px "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;

  // 링 안쪽
  x.textAlign = 'center';
  x.fillStyle = '#8a94a8';
  x.font = font(44);
  x.fillText('DAY', cx, cy - 80);
  x.fillStyle = '#7fb8a4';
  x.font = font(190, 800);
  x.fillText(String(day), cx, cy + 80);
  x.fillStyle = '#8a94a8';
  x.font = font(40);
  x.fillText(`${count} / ${total} 완료`, cx, cy + 160);

  // 하단 텍스트
  x.fillStyle = '#e8ecf4';
  x.font = font(56, 700);
  x.fillText('오늘의 명상 완료', cx, 810);
  x.fillStyle = '#8a94a8';
  x.font = font(40);
  x.fillText(`${dateLabel} · ${streak}일 연속`, cx, 880);
  x.fillStyle = '#5a9683';
  x.font = font(36, 600);
  x.fillText('명상 100일 챌린지', cx, 985);

  return c;
}

export async function shareCard(info) {
  const canvas = drawCard(info);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], `meditation-day-${info.day}.png`, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: '명상 100일 챌린지',
        text: `Day ${info.day} 명상 완료! (${info.streak}일 연속)`,
      });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // 사용자가 공유 시트를 닫음
    }
  }
  // 폴백: 다운로드
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
