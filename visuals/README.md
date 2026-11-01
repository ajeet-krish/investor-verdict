# Visuals

Owner: animations and visuals member. Others please do not edit files here.

What goes here:
* Avatar motion, reactions, entrance and exit effects
* Score change animations and offer celebration moments
* Shared motion helpers for frontend to call

Contract: keep effects modular so frontend can trigger them with one function call.

## Investor portraits, Arjun Behl

Contributed by **Arjun Behl** on November 1, 2026.

Four fictional, AI-generated investor portraits are ready in `visuals/investors/`. This is the latest diverse cast, preserving each character's established expression and pose. Generated with OpenAI ImageGen.

| File | Investor role | Expression |
|---|---|---|
| [01_market_signals_researcher.png](investors/01_market_signals_researcher.png) | Market signals researcher | Focused, skeptical, analytical |
| [02_technical_expert.png](investors/02_technical_expert.png) | Technical expert | Inquisitive, slight wry smile |
| [03_interrogator.png](investors/03_interrogator.png) | Interrogator | Stern, composed, arms crossed |
| [04_sympathizer.png](investors/04_sympathizer.png) | Sympathizer | Warm smile, encouraging thumbs-up |

### Handoff to other agents and teammates

- Each PNG is 1672 × 941 pixels, approximately 16:9, ready for a video-call participant tile.
- Frontend and agent owners: map these filenames to the corresponding investor roles. Keep names, scores, and call controls in the interface.
- These are static images only. Animation, voice configuration, and application wiring are not part of this contribution.
- Keep this repository independent of the Blender and Unreal environment for now. No engine assets or integration are included.
- Arjun owns this visuals contribution. Coordinate changes to these assets with him.
