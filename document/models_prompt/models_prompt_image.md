# GPT-image-1

`prompt_templates.body`
{
  "prompt": "{{userPrompt}}\n\nGlobal style guide (always apply):\n- Clear, readable composition with a strong focal subject\n- Rich, high-quality visual detail (materials, textures, lighting)\n\nHard constraints (must follow):\n- No text, no letters, no numbers, no captions, no speech bubbles\n- No logos, no watermarks, no signatures, no UI\n\nQuality targets:\n- Sharp, clean, high fidelity\n- Avoid blur, noise, artifacts, distorted anatomy"
}

`response_schemas.schemas`
{
  "type": "object",
  "required": ["images"],
  "additionalProperties": false,
  "properties": {
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "markdown"],
        "additionalProperties": false,
        "properties": {
          "type": { "const": "markdown" },
          "markdown": { "type": "string" }
        }
      }
    },
    "images": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "url": { "type": "string" },
          "b64_json": { "type": "string" },
          "mime_type": { "type": "string" },
          "width": { "type": "integer" },
          "height": { "type": "integer" }
        },
        "anyOf": [
          { "required": ["url"] },
          { "required": ["b64_json"] }
        ]
      }
    }
  }
}


`ai_models.capabilities`
{
  "model": "gpt-image-1",
  "limits": {
    "max_images_per_request": 10
  },
  "options": {
    "n": {
      "max": 10,
      "min": 1,
      "type": "int",
      "label": "n",
      "description": "Number of images per request"
    },
    "size": {
      "type": "enum",
      "label": "size",
      "values": [
        "auto",
        "1024x1024",
        "1536x1024",
        "1024x1536"
      ],
      "description": "Image size (GPT Image models)"
    },
    "quality": {
      "type": "enum",
      "label": "quality",
      "values": [
        "auto",
        "high",
        "medium",
        "low"
      ],
      "description": "Image quality (GPT Image models)"
    },
    "background": {
      "type": "enum",
      "label": "background",
      "values": [
        "auto",
        "transparent",
        "opaque"
      ],
      "description": "Background transparency (transparent requires png/webp)"
    },
    "output_format": {
      "type": "enum",
      "label": "output_format",
      "values": [
        "png",
        "jpeg",
        "webp"
      ],
      "description": "Output image format"
    },
    "output_compression": {
      "type": "int",
      "label": "output_compression",
      "min": 0,
      "max": 100,
      "description": "Compression level (0-100) for jpeg/webp"
    },
    "moderation": {
      "type": "enum",
      "label": "moderation",
      "values": [
        "auto",
        "low"
      ],
      "description": "Moderation level for GPT Image models"
    }
  },
  "defaults": {
    "n": 1,
    "size": "auto",
    "quality": "auto",
    "background": "auto",
    "output_format": "png",
    "output_compression": 100,
    "moderation": "auto"
  },
  "supports": {
    "n": true,
    "size": true,
    "quality": true,
    "background": true,
    "output_format": true,
    "output_compression": true,
    "moderation": true
  }
}

// ----------------------------------------------------------

