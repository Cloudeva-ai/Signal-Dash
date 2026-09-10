# Mascot Motion Assets

Generated with the built-in imagegen tool. Files live in `mascot/`:

- `Eva_Idle.png`: steady stance, both feet down, relaxed arms, facing right.
- `Eva_Run.png`: forward stride with pumping arms, based on `src/hero/Cloudeva_Run.png` from Amit Story.
- `Eva_Jump.png`: raised forward fist and tucked knees, based on `src/hero/CloudEva_Jump.png` from Amit Story.

Prompt set: preserve the CloudEVA black cat identity, huge head, green eyes,
teal visor with opaque white rim, pink ears, white shirt, gloves and shoes.
Render each full-body pose in the same cute 3D style, facing right, with
transparent RGBA empty space and no ground, shadow, text or checkerboard.
Use the Amit images only for limb poses, never for identity or clothing.

The game selects idle when grounded and still, run when moving on the ground,
and jump while airborne. Leftward movement mirrors the sprite. PNG alpha is
preserved without color-key removal, so white outfit details remain intact.

Run `node qa/motion-check.cjs` to check the state transitions and start timing.
