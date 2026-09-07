# Huong dan tuy chinh Brand Visual

Skill nay mac dinh dung brand Contentta (Orbital 2026.05). De doi sang brand khac, chinh 7 CSS variable va font stack ben duoi.

## 1. Bang mau — 7 CSS Variables

Ty le su dung: **60% background / 25% text-content / 15% accent**

| Variable | Gia tri mac dinh | Vai tro |
|----------|-----------------|---------|
| `--deep-space` | `#070409` | Background chinh (60%). Nen toi cho moi scene |
| `--stardust` | `#FAF7F5` | Text chinh + content (25%). Mau chu mac dinh |
| `--cosmic-red` | `#E10E1F` | Accent chinh (15%). Emphasis, caption highlight, CTA |
| `--hot-flare` | `#FF4D2A` | Accent phu — gradient endpoint, hover state |
| `--ember` | `#B30A18` | Accent dam — border, underline, shadow |
| `--maroon` | `#4A0008` | Overlay toi — vignette, text shadow background |
| `--dust` | `#D4CFC9` | Text phu — subtitle, secondary info, muted text |

### Cach doi

Trong file `index.html` hoac `compositions/*.html`, tim block `:root` va thay gia tri:

```css
:root {
  --deep-space: #070409;    /* doi thanh mau nen cua brand ban */
  --stardust: #FAF7F5;      /* doi thanh mau chu chinh */
  --cosmic-red: #E10E1F;    /* doi thanh mau accent chinh */
  --hot-flare: #FF4D2A;
  --ember: #B30A18;
  --maroon: #4A0008;
  --dust: #D4CFC9;
}
```

## 2. Font Stack

| Variable | Font mac dinh | Vai tro |
|----------|--------------|---------|
| `--font-display` | `'Be Vietnam Pro', sans-serif` | Tieu de, so lieu lon, CTA |
| `--font-body` | `'Plus Jakarta Sans', sans-serif` | Body text, caption, subtitle |

### Cach doi font

1. Chon font moi tren [Google Fonts](https://fonts.google.com/)
2. Them link vao `<head>` cua composition:

```html
<head>
  <!-- Xoa font cu -->
  <!-- Them font moi -->
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --font-display: 'Montserrat', sans-serif;
      --font-body: 'Inter', sans-serif;
    }
  </style>
</head>
```

3. Cap nhat moi composition dung chung font — khong de moi scene 1 font khac nhau

## 3. Do / Don't

### DO
- Giu ty le 60/25/15 khi doi mau — contrast phai du de doc tren mobile
- Dung accent color (--cosmic-red) cho toi da 2-3 element moi scene
- Test font tieng Viet co dau day du (a, o, u, e) truoc khi chot
- Kiem tra tren nen toi VA nen sang neu brand co ca hai

### DON'T
- Khong dung qua 3 mau accent trong 1 video — gay roi mat
- Khong doi font giua cac scene trong cung 1 video
- Khong dung font khong ho tro tieng Viet co dau (se bi loi ky tu)
- Khong de text accent tren background accent (vd: do tren cam) — khong doc duoc

## 4. Kiem tra sau khi doi brand

Chay preview de xac nhan visual:

```bash
cd video-projects/<ten-project>
npx hyperframes preview
```

Kiem tra:
- Text doc duoc tren moi nen (contrast ratio >= 4.5:1)
- Accent color noi bat nhung khong choi mat
- Font hien thi dung voi dau tieng Viet
- Khong co element nao bi mat mau (text cung mau voi nen)
