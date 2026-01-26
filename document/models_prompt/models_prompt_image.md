# GPT-image-1.5

`prompt_templates.body`
``` json
{
  "prompt": "{{userPrompt}}\n\nImage usage rule (very important):\n- If a reference image is provided, you MUST use it as the primary subject.\n- Apply a transformation to the provided image, not generate a new subject.\n- Preserve identity, proportions, and core structure of the original image unless explicitly told otherwise.\n\nGlobal style guide (always apply):\n- Clear, readable composition with a strong focal subject\n- Rich, high-quality visual detail (materials, textures, lighting)\n\nHard constraints (must follow):\n- No text, no letters, no numbers, no captions, no speech bubbles\n- No logos, no watermarks, no signatures, no UI\n\nQuality targets:\n- Sharp, clean, high fidelity\n- Avoid blur, noise, artifacts, distorted anatomy"
}
```


`response_schemas.schemas`
``` json
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
```

`ai_models.capabilities`
``` json
{
  "model": "gpt-image-1.5",
  "limits": {
    "max_images_per_request": 10,
    "max_partial_images": 3
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
      "values": ["auto", "1024x1024", "1536x1024", "1024x1536"],
      "description": "Image size (GPT Image models)"
    },
    "quality": {
      "type": "enum",
      "label": "quality",
      "values": ["auto", "high", "medium", "low"],
      "description": "Image quality (GPT Image models)"
    },
    "background": {
      "type": "enum",
      "label": "background",
      "values": ["auto", "transparent", "opaque"],
      "description": "Background mode (transparent requires png/webp)"
    },
    "moderation": {
      "type": "enum",
      "label": "moderation",
      "values": ["auto", "low"],
      "description": "Moderation level for GPT Image models"
    },
    "output_format": {
      "type": "enum",
      "label": "output_format",
      "values": ["png", "jpeg", "webp"],
      "description": "Output image format"
    },
    "output_compression": {
      "max": 100,
      "min": 0,
      "type": "int",
      "label": "output_compression",
      "description": "Compression level (0-100) for jpeg/webp; ignored for png"
    },

    "stream": {
      "type": "bool",
      "label": "stream",
      "description": "If true, stream image generation events as they become available"
    },
    "partial_images": {
      "max": 3,
      "min": 0,
      "type": "int",
      "label": "partial_images",
      "description": "Number of partial images to stream (0-3). Only relevant when stream=true"
    }    
  },
  "defaults": {
    "n": 1,
    "size": "auto",
    "quality": "auto",
    "background": "auto",
    "moderation": "auto",
    "output_format": "png",
    "output_compression": 100,

    "stream": false,
    "partial_images": 0    
  },
  "supports": {
    "n": true,
    "size": true,
    "quality": true,
    "background": true,
    "moderation": true,
    "output_format": true,
    "output_compression": true,
    "stream": true,
    "partial_images": true    
  },
  "validation_hints": [
    "If background=transparent, output_format should be png or webp.",
    "output_compression applies only when output_format is jpeg or webp.",
    "partial_images is only meaningful when stream=true."
  ]
}
```

// ----------------------------------------------------------

