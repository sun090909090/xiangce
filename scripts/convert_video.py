#!/usr/bin/env python3
"""Convert an album's browser-exported video to compatible H.264 MP4."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description='将相册翻页视频转成 MP4，可选添加用户提供的音乐')
    parser.add_argument('input', type=Path)
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--ffmpeg', help='已有 FFmpeg 可执行文件路径，默认从 PATH 查找')
    parser.add_argument('--music', type=Path, help='可选：用户提供或授权的背景音乐')
    parser.add_argument('--volume', type=float, default=0.25)
    args = parser.parse_args()
    source, target = args.input.expanduser().resolve(), args.output.expanduser().resolve()
    ffmpeg = args.ffmpeg or shutil.which('ffmpeg')
    if not ffmpeg:
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass
    if not source.is_file():
        parser.error('找不到输入视频')
    if not ffmpeg:
        parser.error('没有找到 FFmpeg。请提供 --ffmpeg 路径，或使用已有依赖环境；未生成 MP4。')
    if target.suffix.lower() != '.mp4' or source == target:
        parser.error('输出须为 .mp4，并与输入文件不同')
    if target.exists():
        parser.error('输出文件已存在，请使用新文件名，避免覆盖')
    if not 0 <= args.volume <= 1:
        parser.error('--volume 范围为 0—1')
    if args.music and not args.music.expanduser().is_file():
        parser.error('找不到背景音乐文件')
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.album-video-', suffix='.mp4', dir=target.parent)
    os.close(fd)
    command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source)]
    if args.music:
        command += ['-stream_loop', '-1', '-i', str(args.music.expanduser().resolve()),
                    '-map', '0:v:0', '-map', '1:a:0', '-af', f'volume={args.volume}',
                    '-c:a', 'aac', '-b:a', '192k', '-shortest']
    else:
        command += ['-map', '0:v:0', '-map', '0:a?', '-c:a', 'aac']
    command += ['-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p', '-r', '30', '-preset', 'medium', '-crf', '18',
                '-movflags', '+faststart', temporary]
    try:
        subprocess.run(command, check=True)
        if Path(temporary).stat().st_size == 0:
            raise RuntimeError('编码结果为空')
        # Exclusive destination creation also protects against another process writing it.
        with target.open('xb') as out, open(temporary, 'rb') as video:
            shutil.copyfileobj(video, out)
        print(f'已生成：{target} ({target.stat().st_size / 1024 / 1024:.1f} MB)')
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        parser.exit(1, f'MP4 转换失败：{error}\n')
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == '__main__':
    main()
