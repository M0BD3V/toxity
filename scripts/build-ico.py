from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
icons = root / "assets" / "brand" / "icons"
sizes = [16, 24, 32, 48, 64, 128, 256]
images = [Image.open(icons / f"toxity-{size}.png").convert("RGBA") for size in sizes]
images[-1].save(icons / "toxity.ico", format="ICO", append_images=images[:-1], sizes=[(s, s) for s in sizes])
print("Windows ICO generated successfully.")
