const { calc, css, physics, pointer, transform, tween, value } = window.popmotion;
const { applyOffset, clamp, nonlinearSpring, pipe } = transform;

function getTotalItemsWidth(items) {
  const { left } = items[0].getBoundingClientRect();
  const { right } = items[items.length - 1].getBoundingClientRect();
  return right - left;
}

function angleIsVertical(angle) {
  const isUp = (
    angle <= -90 + 45 &&
    angle >= -90 - 45
  );
  const isDown = (
    angle <= 90 + 45 &&
    angle >= 90 - 45
  );

  return (isUp || isDown);
}

function carousel(container) {
  // Select DOM
  const slider = container.querySelector('.slider');
  const items = slider.querySelectorAll('.item');
  const nextButton = container.querySelector('.next');
  const prevButton = container.querySelector('.prev');
  const progressBar = container.querySelector('.progress-bar');
  
  function checkNavButtonStatus(x) {
    if (x <= minXOffset) {
      nextButton.classList.add('disabled');
    } else {
      nextButton.classList.remove('disabled');

      if (x >= maxXOffset) {
        prevButton.classList.add('disabled');
      } else {
        prevButton.classList.remove('disabled');
      }
    }
  }

  const totalItemsWidth = getTotalItemsWidth(items);
  const maxXOffset = 0;

  let minXOffset = 0;
  let sliderVisibleWidth = 0;
  let clampXOffset;

  function measureCarousel() {
    sliderVisibleWidth = slider.offsetWidth;
    minXOffset = - (totalItemsWidth - sliderVisibleWidth);
    clampXOffset = clamp(minXOffset, maxXOffset);
  }
  
  measureCarousel();

  // Create renderers
  const sliderRenderer = css(slider);
  const progressBarRenderer = css(progressBar);
  
  function updateProgressBar(x) {
    const progress = calc.getProgressFromValue(maxXOffset, minXOffset, x);
    progressBarRenderer.set('scaleX', Math.max(progress, 0));
  }

  const sliderX = value(0, (x) => {
    updateProgressBar(x);
    sliderRenderer.set('x', x);
  });

  let action;
  let touchOrigin = { x: 0, y: 0 };

  // Touch event handling
  function stopTouchScroll() {
    document.removeEventListener('touchend', stopTouchScroll);
    if (action) action.stop();
    
    const currentX = sliderX.get();
    
    if (currentX < minXOffset || currentX > maxXOffset) {
      action = physics({
        from: currentX,
        to: (currentX < minXOffset) ? minXOffset : maxXOffset,
        spring: 800,
        friction: 0.92
      }).output((v) => sliderX.set(v))
        .start();
    } else {
      action = physics({
        from: currentX,
        velocity: sliderX.getVelocity(),
        friction: 0.2
      }).output(pipe(
        clampXOffset,
        (v) => {
          checkNavButtonStatus(v);
          sliderX.set(v);
        }
      )).start();
    }
  }

  function determineDragDirection(e) {
    const touch = e.changedTouches[0];
    const touchLocation = {
      x: touch.pageX,
      y: touch.pageY
    };
    const distance = calc.distance(touchOrigin, touchLocation);

    if (!distance) return;
    document.removeEventListener('touchmove', determineDragDirection);

    const angle = calc.angle(touchOrigin, touchLocation);
    if (angleIsVertical(angle)) return;

    if (action) action.stop();
    action = pointer(e).start();
    
    const elasticity = 5;
    const tugLeft = nonlinearSpring(elasticity, maxXOffset);
    const tugRight = nonlinearSpring(elasticity, minXOffset);
    
    const applySpring = (v) => {
      if (v > maxXOffset) return tugLeft(v);
      if (v < minXOffset) return tugRight(v);
      return v;
    };

    action.output(pipe(
      ({ x }) => x,
      applyOffset(action.x.get(), sliderX.get()),
      applySpring,
      (v) => sliderX.set(v)
    ));
  }

  function startTouchScroll(e) {
    document.addEventListener('touchend', stopTouchScroll);
    if (action) action.stop();
    const touch = e.touches[0];
    touchOrigin = {
      x: touch.pageX,
      y: touch.pageY
    };
    document.addEventListener('touchmove', determineDragDirection);
  }
  
  function onWheel(e) {
    const angle = calc.angle({
      x: e.deltaX,
      y: e.deltaY
    });

    if (angleIsVertical(angle)) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const newX = clampXOffset(
      sliderX.get() + - e.deltaX // (e.deltaX * factor) can speed or slow scroll
    );
    checkNavButtonStatus(newX);
    sliderX.set(newX);
  }
  
  function findClosestItemOffset(targetX, delta) {
    const { right, width } = items[0].getBoundingClientRect();
    const spacing = items[1].getBoundingClientRect().left - right;
    const totalItems = Math.abs(targetX) / (width + spacing);
    const totalCompleteItems = delta === 1
      ? Math.floor(totalItems)
      : Math.ceil(totalItems);

    return 0 - totalCompleteItems * (width + spacing);
  }
  
  function goto(delta) {
    const currentX = sliderX.get();
    let targetX = currentX + (- sliderVisibleWidth * delta);
    const clampedX = clampXOffset(targetX);

    targetX = (targetX === clampedX)
      ? findClosestItemOffset(targetX, delta)
      : clampedX;
    
    if (action) action.stop();
    action = tween({
      from: currentX,
      to: targetX,
      onUpdate: sliderX
    }).start();
    checkNavButtonStatus(targetX);
  }
  
  function notifyEnd(delta, targetOffset) {
    if (action) action.stop();
    action = physics({
      from: sliderX.get(),
      to: targetOffset,
      velocity: 2000 * delta,
      spring: 300,
      friction: 0.9
    })
      .output((v) => sliderX.set(v))
      .start();
  }
  
  const gotoNext = (e) => !e.target.classList.contains('disabled')
    ? goto(1)
    : notifyEnd(-1, minXOffset);

  const gotoPrev = (e) => !e.target.classList.contains('disabled')
    ? goto(-1)
    : notifyEnd(1, maxXOffset);
  
  function onFocus(e) {
    const { left, right } = e.target.getBoundingClientRect();
    const carouselLeft = container.getBoundingClientRect().left;

    if (left < carouselLeft) {
      gotoPrev();
    } else if (right > carouselLeft + sliderVisibleWidth) {
      gotoNext();
    }
  }

  container.addEventListener('touchstart', startTouchScroll);
  container.addEventListener('wheel', onWheel);
  nextButton.addEventListener('click', gotoNext);
  prevButton.addEventListener('click', gotoPrev);
  slider.addEventListener('focus', onFocus, true);
  window.addEventListener('resize', measureCarousel);
  
  return () => {
    container.removeEventListener('touchstart', startTouchScroll);
    container.removeEventListener('wheel', onWheel);
    nextButton.removeEventListener('click', gotoNext);
    prevButton.removeEventListener('click', gotoPrev);
    slider.removeEventListener('focus', onFocus);
    window.removeEventListener('resize', measureCarousel);
  };
}

const destroyCarousel = carousel(document.querySelector('.container'));