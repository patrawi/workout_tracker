# Propose consumed fractions from after images, quartiles without them

When both before and after images exist, the VLM proposes a Consumed Fraction separately for each coarse Portion Component and the user confirms or corrects each value; when no after image exists, the user chooses the fraction directly from all, three quarters, half, or a quarter. We chose this split because before/after comparison is exactly where a model can assist, while fixed quartiles keep the no-after path low-friction; in both cases the AI output remains a proposal and never becomes an observed fact.
