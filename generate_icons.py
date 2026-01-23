#!/usr/bin/env python3
"""
Generate PWA icons for News Bulletin Aggregator
Creates app icons in various sizes for iOS and Android
"""

from PIL import Image, ImageDraw
import os
from pathlib import Path

# Icon sizes needed
ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
OUTPUT_DIR = Path('static/icons')

def create_icon(size, output_path, maskable=False):
    """
    Create a simple icon with Quantium branding

    Args:
        size: Icon size in pixels (square)
        output_path: Path to save the icon
        maskable: If True, adds safe area padding for maskable icons
    """
    # Create image with black background
    img = Image.new('RGB', (size, size), color='#000000')
    draw = ImageDraw.Draw(img)

    # Calculate dimensions (with safe area for maskable icons)
    if maskable:
        # Maskable icons need 20% safe area (80% of icon is safe zone)
        padding = size * 0.1  # 10% padding on each side
        effective_size = size - (2 * padding)
    else:
        padding = size * 0.15  # 15% padding for standard icons
        effective_size = size - (2 * padding)

    # Draw circles (simplified Quantium logo)
    centre_x = size / 2
    centre_y = size / 2

    # Main circle (yellow)
    main_radius = effective_size * 0.35
    draw.ellipse(
        [centre_x - main_radius, centre_y - main_radius,
         centre_x + main_radius, centre_y + main_radius],
        fill='#FFE600'
    )

    # Inner circle (black)
    inner_radius = main_radius * 0.4
    draw.ellipse(
        [centre_x - inner_radius, centre_y - inner_radius,
         centre_x + inner_radius, centre_y + inner_radius],
        fill='#000000'
    )

    # Bottom right accent circle (yellow)
    accent_radius = main_radius * 0.25
    accent_x = centre_x + main_radius * 0.8
    accent_y = centre_y + main_radius * 0.8
    draw.ellipse(
        [accent_x - accent_radius, accent_y - accent_radius,
         accent_x + accent_radius, accent_y + accent_radius],
        fill='#FFE600'
    )

    # Save icon
    img.save(output_path, 'PNG', optimize=True)
    print(f"Created {output_path.name} ({size}x{size})")


def main():
    """Generate all required icons"""
    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

    print("Generating PWA icons...")

    # Generate standard icons
    for size in ICON_SIZES:
        output_path = OUTPUT_DIR / f'icon-{size}.png'
        create_icon(size, output_path, maskable=False)

    # Generate maskable icons (Android adaptive icons)
    for size in [192, 512]:
        output_path = OUTPUT_DIR / f'icon-maskable-{size}.png'
        create_icon(size, output_path, maskable=True)

    print(f"\n✓ Generated {len(ICON_SIZES) + 2} icons in {OUTPUT_DIR}")
    print("\nIcons are ready for PWA installation!")


if __name__ == '__main__':
    main()
