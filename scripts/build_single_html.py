#!/usr/bin/env python3
"""
Builds Phantom Blade: Severed Soul into a single self-contained HTML file (`dist-single/index.html`).
- Non-destructively compresses 85 WAV audio tracks -> AAC-LC (.m4a) via macOS `afconvert`
- Compresses 7 GLB 3D models (resizes/recompresses embedded textures via `sips` + FP32 mantissa rounding)
- Downsamples 1K IBL HDRI (1024x512 -> 512x256 RGBE)
- Packs Vite JS bundle + all assets into a single gzip-compressed VFS archive with native `DecompressionStream('gzip')` bootstrap
"""

import base64
import concurrent.futures
import glob
import gzip
import json
import math
import os
import re
import shutil
import struct
import subprocess
import tempfile
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PUBLIC_DIR = os.path.join(ROOT, "public")
DIST_DIR = os.path.join(ROOT, "dist")
OUT_DIR = os.path.join(ROOT, "dist-single")


def sips_info(path):
    out = subprocess.check_output(
        ["/usr/bin/sips", "-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", path],
        stderr=subprocess.DEVNULL,
    ).decode("utf-8", errors="ignore")
    w = int(re.search(r"pixelWidth:\s*(\d+)", out).group(1))
    h = int(re.search(r"pixelHeight:\s*(\d+)", out).group(1))
    alpha = "yes" in re.search(r"hasAlpha:\s*(\w+)", out).group(1).lower()
    return w, h, alpha


def compress_glb_image(args):
    bv_idx, raw_bytes, mime, keep_png, max_dim, jpeg_q, tmp_dir = args
    ext = ".png" if mime == "image/png" else ".jpg"
    in_path = os.path.join(tmp_dir, f"in_{bv_idx}{ext}")
    with open(in_path, "wb") as f:
        f.write(raw_bytes)
    try:
        w, h, has_alpha = sips_info(in_path)
    except Exception:
        return bv_idx, raw_bytes, mime

    use_png = keep_png or (mime == "image/png" and has_alpha)
    out_ext = ".png" if use_png else ".jpg"
    out_mime = "image/png" if use_png else "image/jpeg"
    out_path = os.path.join(tmp_dir, f"out_{bv_idx}{out_ext}")

    cmd = ["/usr/bin/sips"]
    if max(w, h) > max_dim:
        cmd += ["-Z", str(max_dim)]
    if use_png:
        cmd += ["-s", "format", "png"]
    else:
        cmd += ["-s", "format", "jpeg", "-s", "formatOptions", str(jpeg_q)]
    cmd += [in_path, "--out", out_path]

    try:
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with open(out_path, "rb") as f:
            new_bytes = f.read()
        if len(new_bytes) < len(raw_bytes):
            return bv_idx, new_bytes, out_mime
    except Exception:
        pass
    return bv_idx, raw_bytes, mime


def round_f32_slice(buf_view_bytes, byte_offset, count, num_comps, stride):
    mv = memoryview(buf_view_bytes)
    for i in range(count):
        base = byte_offset + i * stride
        for c in range(num_comps):
            pos = base + c * 4
            if pos + 4 > len(buf_view_bytes):
                break
            u = struct.unpack_from("<I", mv, pos)[0]
            exp = u & 0x7F800000
            if exp != 0x7F800000 and (u & 0x7FFFFFFF) != 0:
                u = (u + 0x00000200) & 0xFFFFFC00
                struct.pack_into("<I", mv, pos, u)


def optimize_glb(glb_path, tmp_root):
    fname = os.path.basename(glb_path)
    with open(glb_path, "rb") as f:
        data = f.read()

    magic, version, total_len = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2
    c0_len, c0_type = struct.unpack_from("<I4s", data, 12)
    gltf = json.loads(data[20 : 20 + c0_len].decode("utf-8"))
    bin_chunk_offset = 20 + c0_len
    c1_len, c1_type = struct.unpack_from("<I4s", data, bin_chunk_offset)
    bin_data = data[bin_chunk_offset + 8 : bin_chunk_offset + 8 + c1_len]

    textures = gltf.get("textures", [])
    images = gltf.get("images", [])
    bvs = gltf.get("bufferViews", [])
    accs = gltf.get("accessors", [])

    alpha_img_indices = set()
    normal_img_indices = set()
    base_img_indices = set()
    for mat in gltf.get("materials", []):
        alpha_mode = mat.get("alphaMode", "OPAQUE")
        pbr = mat.get("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr:
            ti = pbr["baseColorTexture"]["index"]
            if ti < len(textures) and "source" in textures[ti]:
                ii = textures[ti]["source"]
                base_img_indices.add(ii)
                if alpha_mode in ("BLEND", "MASK"):
                    alpha_img_indices.add(ii)
        if "normalTexture" in mat:
            ti = mat["normalTexture"]["index"]
            if ti < len(textures) and "source" in textures[ti]:
                normal_img_indices.add(textures[ti]["source"])

    # Extract mutable bytearrays per bufferView
    bv_blobs = []
    for bv in bvs:
        off = bv.get("byteOffset", 0)
        ln = bv["byteLength"]
        bv_blobs.append(bytearray(bin_data[off : off + ln]))

    # Recompress embedded images in parallel
    is_character = fname in ("hero_hun.glb", "boss_xiaocanyang.glb")
    img_dir = tempfile.mkdtemp(dir=tmp_root, prefix=f"glb_{fname}_")
    tasks = []
    seen_bvs = {}
    for img_idx, img in enumerate(images):
        if "bufferView" not in img:
            continue
        bvi = img["bufferView"]
        if bvi in seen_bvs:
            continue
        seen_bvs[bvi] = img_idx
        keep_png = img_idx in alpha_img_indices
        if is_character and img_idx in base_img_indices:
            max_dim, jpeg_q = 768, 72
        elif img_idx in normal_img_indices:
            max_dim, jpeg_q = 512, 72
        elif fname == "temple_courtyard.glb":
            max_dim, jpeg_q = 512, 64
        else:
            max_dim, jpeg_q = 512, 68
        tasks.append((bvi, bytes(bv_blobs[bvi]), img.get("mimeType", "image/jpeg"), keep_png, max_dim, jpeg_q, img_dir))

    if tasks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            for bvi, new_bytes, new_mime in ex.map(compress_glb_image, tasks):
                bv_blobs[bvi] = bytearray(new_bytes)
                for img in images:
                    if img.get("bufferView") == bvi:
                        img["mimeType"] = new_mime

    # Round low mantissa bits of safe static/skinned mesh vertex attributes (never joints/weights/IBM/animations)
    comp_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    safe_attrs = {"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0", "TEXCOORD_1", "COLOR_0"}
    rounded_accs = set()
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            for attr_name, acc_idx in prim.get("attributes", {}).items():
                if attr_name not in safe_attrs or acc_idx in rounded_accs:
                    continue
                rounded_accs.add(acc_idx)
                acc = accs[acc_idx]
                if acc.get("componentType") != 5126 or "sparse" in acc or "bufferView" not in acc:
                    continue
                nc = comp_counts.get(acc.get("type"), 0)
                if not nc:
                    continue
                bvi = acc["bufferView"]
                bv = bvs[bvi]
                stride = bv.get("byteStride", nc * 4)
                off = acc.get("byteOffset", 0)
                round_f32_slice(bv_blobs[bvi], off, acc["count"], nc, stride)

    # Rebuild BIN chunk with 4-byte alignment
    new_bin = bytearray()
    for i, bv in enumerate(bvs):
        while len(new_bin) % 4 != 0:
            new_bin.append(0)
        bv["byteOffset"] = len(new_bin)
        bv["byteLength"] = len(bv_blobs[i])
        new_bin.extend(bv_blobs[i])
    while len(new_bin) % 4 != 0:
        new_bin.append(0)

    gltf["buffers"][0]["byteLength"] = len(new_bin)
    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_out_len = 12 + 8 + len(json_bytes) + 8 + len(new_bin)
    out = bytearray()
    out.extend(struct.pack("<4sII", b"glTF", 2, total_out_len))
    out.extend(struct.pack("<I4s", len(json_bytes), b"JSON"))
    out.extend(json_bytes)
    out.extend(struct.pack("<I4s", len(new_bin), b"BIN\x00"))
    out.extend(new_bin)
    return bytes(out)


def decode_radiance_hdr(data):
    # Parse header until empty line + resolution line
    pos = 0
    while True:
        nl = data.index(b"\n", pos)
        line = data[pos:nl].decode("ascii", errors="ignore").strip()
        pos = nl + 1
        if line == "":
            break
    nl = data.index(b"\n", pos)
    dim_line = data[pos:nl].decode("ascii").strip()
    pos = nl + 1
    m = re.match(r"-Y\s+(\d+)\s+\+X\s+(\d+)", dim_line)
    assert m, f"Unexpected HDR dimension line: {dim_line}"
    h, w = int(m.group(1)), int(m.group(2))

    rgbe = bytearray(w * h * 4)
    for y in range(h):
        b0, b1, b2, b3 = data[pos], data[pos + 1], data[pos + 2], data[pos + 3]
        pos += 4
        assert b0 == 2 and b1 == 2 and ((b2 << 8) | b3) == w
        scan = bytearray(4 * w)
        ptr = 0
        ptr_end = 4 * w
        while ptr < ptr_end:
            code = data[pos]
            pos += 1
            if code > 128:
                cnt = code - 128
                val = data[pos]
                pos += 1
                scan[ptr : ptr + cnt] = bytes([val]) * cnt
                ptr += cnt
            else:
                cnt = code
                scan[ptr : ptr + cnt] = data[pos : pos + cnt]
                pos += cnt
                ptr += cnt
        row_off = y * w * 4
        for x in range(w):
            rgbe[row_off + x * 4 + 0] = scan[x]
            rgbe[row_off + x * 4 + 1] = scan[w + x]
            rgbe[row_off + x * 4 + 2] = scan[2 * w + x]
            rgbe[row_off + x * 4 + 3] = scan[3 * w + x]
    return w, h, rgbe


def rgbe_to_rgb(r, g, b, e):
    if e == 0:
        return 0.0, 0.0, 0.0
    f = math.ldexp(1.0, e - (128 + 8))
    return (r + 0.5) * f, (g + 0.5) * f, (b + 0.5) * f


def rgb_to_rgbe(r, g, b):
    v = max(r, g, b)
    if v < 1e-32:
        return 0, 0, 0, 0
    m, e = math.frexp(v)
    scale = m * 256.0 / v
    er = min(255, max(0, int(r * scale)))
    eg = min(255, max(0, int(g * scale)))
    eb = min(255, max(0, int(b * scale)))
    ee = min(255, max(0, e + 128))
    return er, eg, eb, ee


def optimize_hdr(hdr_path):
    with open(hdr_path, "rb") as f:
        data = f.read()
    w, h, rgbe = decode_radiance_hdr(data)
    nw, nh = w // 2, h // 2
    flat = bytearray(nw * nh * 4)
    for y in range(nh):
        for x in range(nw):
            sr = sg = sb = 0.0
            for dy in (0, 1):
                for dx in (0, 1):
                    idx = ((y * 2 + dy) * w + (x * 2 + dx)) * 4
                    cr, cg, cb = rgbe_to_rgb(rgbe[idx], rgbe[idx + 1], rgbe[idx + 2], rgbe[idx + 3])
                    sr += cr
                    sg += cg
                    sb += cb
            er, eg, eb, ee = rgb_to_rgbe(sr * 0.25, sg * 0.25, sb * 0.25)
            oidx = (y * nw + x) * 4
            flat[oidx : oidx + 4] = bytes((er, eg, eb, ee))
    # Prevent RGBELoader from mistaking flat RGBE buffer for RLE magic (2, 2)
    if flat[0] == 2 and flat[1] == 2:
        flat[0] = 3
    header = f"#?RADIANCE\nEXPOSURE=1\nGAMMA=1\nFORMAT=32-bit_rle_rgbe\n\n-Y {nh} +X {nw}\n".encode("ascii")
    return header + bytes(flat)


def transcode_wav_worker(args):
    vfs_key, wav_path, tmp_dir = args
    rel = vfs_key.replace("/", "_")
    out_m4a = os.path.join(tmp_dir, rel + ".m4a")
    if "/bgm/" in vfs_key:
        cmd = ["/usr/bin/afconvert", "-f", "m4af", "-d", "aac", "-b", "96000", wav_path, out_m4a]
    elif "/vo/" in vfs_key:
        cmd = ["/usr/bin/afconvert", "-f", "m4af", "-d", "aac", "-c", "1", "-b", "56000", wav_path, out_m4a]
    elif "amb_" in vfs_key:
        cmd = ["/usr/bin/afconvert", "-f", "m4af", "-d", "aac", "-b", "72000", wav_path, out_m4a]
    else:
        cmd = ["/usr/bin/afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", wav_path, out_m4a]
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(out_m4a, "rb") as f:
        return vfs_key, f.read()


def main():
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp_root = tempfile.mkdtemp(prefix="pb_single_build_")

    try:
        # 1. Read compiled Vite JS & CSS
        css_files = sorted(glob.glob(os.path.join(DIST_DIR, "assets", "*.css")))
        js_files = sorted(glob.glob(os.path.join(DIST_DIR, "assets", "*.js")))
        assert css_files and js_files, "Run `npm run build` before build_single_html.py"
        with open(css_files[0], "r", encoding="utf-8") as f:
            css_text = f.read()
        with open(js_files[0], "rb") as f:
            js_bytes = f.read()

        vfs_files = {}  # vfs_key -> (bytes, mime)
        vfs_files["/__app.js"] = (js_bytes, "text/javascript")

        # 2. Compress HDRI
        hdr_src = os.path.join(PUBLIC_DIR, "assets", "hdri", "courtyard_night_1k.hdr")
        hdr_bytes = optimize_hdr(hdr_src)
        vfs_files["/assets/hdri/courtyard_night_1k.hdr"] = (hdr_bytes, "application/octet-stream")
        print(f"[HDRI] {os.path.getsize(hdr_src)/1048576:.2f} MB -> {len(hdr_bytes)/1048576:.2f} MB (raw)")

        # 3. Compress 7 GLBs
        models_dir = os.path.join(PUBLIC_DIR, "assets", "models")
        total_glb_in = 0
        total_glb_out = 0
        for fn in sorted(os.listdir(models_dir)):
            if not fn.endswith(".glb"):
                continue
            src_p = os.path.join(models_dir, fn)
            in_sz = os.path.getsize(src_p)
            opt_bytes = optimize_glb(src_p, tmp_root)
            total_glb_in += in_sz
            total_glb_out += len(opt_bytes)
            vfs_files[f"/assets/models/{fn}"] = (opt_bytes, "model/gltf-binary")
            print(f"[GLB]  {fn:26s}: {in_sz/1048576:6.2f} MB -> {len(opt_bytes)/1048576:6.2f} MB")
        print(f"[GLB TOTAL] {total_glb_in/1048576:.2f} MB -> {total_glb_out/1048576:.2f} MB")

        # 4. Compress Audio (manifest.json + all .wav files)
        manifest_src = os.path.join(PUBLIC_DIR, "assets", "audio", "vo", "manifest.json")
        with open(manifest_src, "rb") as f:
            manifest_bytes = json.dumps(json.loads(f.read().decode("utf-8")), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        vfs_files["/assets/audio/vo/manifest.json"] = (manifest_bytes, "application/json")

        wav_tasks = []
        total_wav_in = 0
        audio_tmp = tempfile.mkdtemp(dir=tmp_root, prefix="audio_")
        for dirpath, _, filenames in os.walk(os.path.join(PUBLIC_DIR, "assets", "audio")):
            for fn in sorted(filenames):
                if not fn.endswith(".wav"):
                    continue
                full_p = os.path.join(dirpath, fn)
                total_wav_in += os.path.getsize(full_p)
                rel_key = "/" + os.path.relpath(full_p, PUBLIC_DIR).replace(os.sep, "/")
                wav_tasks.append((rel_key, full_p, audio_tmp))

        total_m4a_out = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            for rel_key, m4a_bytes in ex.map(transcode_wav_worker, wav_tasks):
                total_m4a_out += len(m4a_bytes)
                vfs_files[rel_key] = (m4a_bytes, "audio/mp4")
        print(f"[AUDIO] {len(wav_tasks)} tracks: {total_wav_in/1048576:.2f} MB -> {total_m4a_out/1048576:.2f} MB")

        # 5. Build Contiguous Binary Pack + Gzip-9
        pack_blob = bytearray()
        vfs_index = {}
        for key in sorted(vfs_files.keys()):
            b, mime = vfs_files[key]
            off = len(pack_blob)
            pack_blob.extend(b)
            vfs_index[key] = [off, len(b), mime]

        raw_pack_mb = len(pack_blob) / 1048576
        gz_pack = gzip.compress(bytes(pack_blob), compresslevel=9, mtime=0)
        gz_pack_mb = len(gz_pack) / 1048576
        b64_pack = base64.b64encode(gz_pack).decode("ascii")
        print(f"[PACK] Uncompressed VFS={raw_pack_mb:.2f} MB -> Gzip-9={gz_pack_mb:.2f} MB -> Base64={len(b64_pack)/1048576:.2f} MB")

        # 6. Assemble Single-File HTML
        with open(os.path.join(ROOT, "index.html"), "r", encoding="utf-8") as f:
            src_html = f.read()

        # Replace stylesheet link with inline <style>
        inline_style = f"<style>{css_text}</style>"
        src_html = re.sub(r'<link[^>]+href=["\']/src/styles/ui\.css["\'][^>]*/?>', lambda _: inline_style, src_html, count=1)

        vfs_index_json = json.dumps(vfs_index, separators=(",", ":"), ensure_ascii=False)
        bootstrap_script = f"""<script id="vfs-pack" type="text/plain">{b64_pack}</script>
<script type="module">
(async () => {{
  const VFS_INDEX = {vfs_index_json};
  const loadingText = document.getElementById('loading-text');
  const loadingFill = document.getElementById('loading-bar-fill');
  if (loadingText) loadingText.textContent = '正在解压单文件内置 3D 武侠引擎与音画资产 (2%)...';
  if (loadingFill) loadingFill.style.width = '2%';

  await new Promise((r) => requestAnimationFrame(r));

  const packEl = document.getElementById('vfs-pack');
  const b64 = packEl.textContent.trim();
  packEl.remove();

  const parts = [];
  const step = 1048576; // 1 MiB (divisible by 4)
  for (let i = 0; i < b64.length; i += step) {{
    const slice = atob(b64.slice(i, i + step));
    const u8 = new Uint8Array(slice.length);
    for (let j = 0; j < slice.length; j++) u8[j] = slice.charCodeAt(j);
    parts.push(u8);
  }}

  if (loadingText) loadingText.textContent = '正在高速流式还原 Blender 场景与配音包 (5%)...';
  if (loadingFill) loadingFill.style.width = '5%';

  const ds = new DecompressionStream('gzip');
  const vfsBuffer = await new Response(new Blob(parts).stream().pipeThrough(ds)).arrayBuffer();
  parts.length = 0;

  const origFetch = window.fetch.bind(window);
  function resolveVfsKey(input) {{
    const raw = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    const clean = raw.split('?')[0].split('#')[0];
    if (VFS_INDEX[clean]) return clean;
    const idx = clean.indexOf('/assets/');
    if (idx !== -1) {{
      const sub = clean.slice(idx);
      if (VFS_INDEX[sub]) return sub;
    }}
    return null;
  }}

  window.fetch = function(input, init) {{
    const key = resolveVfsKey(input);
    if (key) {{
      const [off, len, mime] = VFS_INDEX[key];
      const body = vfsBuffer.slice(off, off + len);
      return Promise.resolve(new Response(body, {{
        status: 200,
        statusText: 'OK',
        headers: {{
          'Content-Type': mime,
          'Content-Length': String(len)
        }}
      }}));
    }}
    return origFetch(input, init);
  }};

  const [jsOff, jsLen] = VFS_INDEX['/__app.js'];
  const jsBlobUrl = URL.createObjectURL(new Blob([vfsBuffer.slice(jsOff, jsOff + jsLen)], {{ type: 'text/javascript' }}));
  await import(jsBlobUrl);
  URL.revokeObjectURL(jsBlobUrl);
}})();
</script>"""

        out_html = re.sub(
            r'<script[^>]+src=["\']/src/main\.js["\'][^>]*>\s*</script>',
            lambda _: bootstrap_script,
            src_html,
            count=1,
        )

        out_path = os.path.join(OUT_DIR, "index.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(out_html)

        final_mb = os.path.getsize(out_path) / 1048576
        final_gz_mb = len(gzip.compress(out_html.encode("utf-8"), compresslevel=6)) / 1048576
        print(f"[DONE] Single HTML written to {out_path}")
        print(f"       Single HTML file size : {final_mb:.2f} MB ({os.path.getsize(out_path):,} bytes)")
        print(f"       HTTP Gzip transfer    : {final_gz_mb:.2f} MB")
        print(f"       Elapsed               : {time.time() - t0:.1f}s")
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    main()
