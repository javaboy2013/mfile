//! 原生启动画面：窗口出现的瞬间即渲染动画，不等 WKWebView 加载页面（本机 webview
//! 首次加载需 7~9s）。实现：在 main 窗口 contentView 顶层盖一个 NSView，其 layer
//! 上用纯 CALayer 树 + CAAnimation 播放"浮动文件夹 + mfile + 三脉冲点"。
//! 前端 JS 就绪后调用 `splash_ready` 移除（露出底下早已渲染的同款内联 #splash 覆盖层，
//! 视觉无缝）；Rust 侧另有 5s 兜底。两个入口均幂等（主线程限定）。

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSColor, NSView};
use objc2_core_foundation::CFType;
use objc2_core_graphics::CGColor;
use objc2_foundation::{NSArray, NSNumber, NSPoint, NSRect, NSSize, NSString};
use objc2_quartz_core::{
    CABasicAnimation, CAGradientLayer, CALayer, CAMediaTiming, CAMediaTimingFunction, CATextLayer,
};
use std::sync::Mutex;

/// 容器 view 指针（主线程限定存取；0 = 无 splash）
static SPLASH_PTR: Mutex<usize> = Mutex::new(0);
/// 原生 splash 起播时刻（None = 未安装）。splash_ready 时换算成已播放秒数
/// 返回前端，HTML 动画以负 animation-delay 续播同一相位，两段动画无缝衔接
static SPLASH_START: Mutex<Option<std::time::Instant>> = Mutex::new(None);

/// 原生 splash 已播放秒数（未安装时 0）
pub fn elapsed_secs() -> f64 {
    SPLASH_START
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_secs_f64())
        .unwrap_or(0.0)
}

fn ns(s: &str) -> Retained<NSString> {
    NSString::from_str(s)
}

// ---------- 对外入口 ----------

/// 系统是否深色外观（主线程调用）。作为主题偏好文件缺失/读失败时的兜底
/// （首次启动前端也跟随系统深浅色，两边一致无闪变）。
pub fn system_dark() -> bool {
    let appearance = objc2_app_kit::NSAppearance::currentDrawingAppearance();
    let candidates = NSArray::from_retained_slice(&[
        ns("NSAppearanceNameAqua"),
        ns("NSAppearanceNameDarkAqua"),
    ]);
    match appearance.bestMatchFromAppearancesWithNames(&candidates) {
        Some(best) => best.to_string() == "NSAppearanceNameDarkAqua",
        None => true, // 拿不到时按深色处理
    }
}

/// 安装原生启动画面（主线程）。content 传 main 窗口的 contentView。
/// dark：应用主题的明暗基调（与前端 splash/主界面同色，杜绝切换闪变；
/// 由 lib.rs 从主题偏好文件读取，与系统外观无关）。
pub fn install(mtm: MainThreadMarker, content: &NSView, dark: bool) {
    let flipped = content.isFlipped();
    let bounds = content.bounds();
    let (w, h) = (bounds.size.width, bounds.size.height);
    let scale = content
        .window()
        .map(|win| win.backingScaleFactor() as f64)
        .unwrap_or(2.0);

    // 容器 NSView（layer-hosting：自建 root layer 后再开 wantsLayer，AppKit 不拥有
    // 也不重建它。若用 layer-backed 模式——先 wantsLayer 再取 layer——AppKit 拥有
    // 该 layer，setup 阶段直接加的 sublayer 会在窗口显示时被丢弃）
    let container = NSView::initWithFrame(
        mtm.alloc::<NSView>(),
        NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(w, h)),
    );
    container.setAutoresizingMask(
        objc2_app_kit::NSAutoresizingMaskOptions::ViewWidthSizable
            | objc2_app_kit::NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    let root = CALayer::new();
    root.setFrame(rect(0.0, 0.0, w, h));
    container.setLayer(Some(&root));
    container.setWantsLayer(true);
    // 底色/字色 = 应用主题基调（与前端 splash 兜底配色一致）
    let (bg, fg) = if dark {
        (srgb(0.118, 0.118, 0.125, 1.0), srgb(0.91, 0.91, 0.918, 1.0)) // #1e1e20 / #e8e8ea
    } else {
        (srgb(0.961, 0.961, 0.969, 1.0), srgb(0.114, 0.114, 0.122, 1.0)) // #f5f5f7 / #1d1d1f
    };
    root.setBackgroundColor(Some(&bg));

    // 布局辅助：以"距窗口顶部"的直觉坐标换算 AppKit layer 坐标
    // （CALayer 坐标系跟随宿主 view 的 flipped 状态）
    let frame_of = |x: f64, y_top: f64, fw: f64, fh: f64| -> NSRect {
        let y = if flipped { y_top } else { h - y_top - fh };
        NSRect::new(NSPoint::new(x, y), NSSize::new(fw, fh))
    };

    // ---- 图标容器层（88x88，中心上方 30pt）----
    let icon_y_top = h / 2.0 - 74.0;
    let icon = CALayer::new();
    icon.setFrame(frame_of(w / 2.0 - 44.0, icon_y_top, 88.0, 88.0));
    build_folder_icon(&icon);
    float_animation(&icon);
    root.addSublayer(&icon);

    // ---- 文字 mfile ----
    let text_y_top = icon_y_top + 88.0 + 18.0;
    let text = CATextLayer::new();
    text.setFrame(frame_of(w / 2.0 - 100.0, text_y_top, 200.0, 20.0));
    // SAFETY: setString 接受任意 NSObject，传入 NSString 类型匹配
    unsafe { text.setString(Some(&ns("mfile"))) };
    // CATextLayer 未设置 font 时不渲染文字；传字体名 + setFontSize 生效
    // SAFETY: NSString 与 CFType 为 toll-free bridge，cast 合法
    unsafe { text.setFont(Some(&Retained::cast_unchecked::<CFType>(ns("Helvetica-Bold")))) };
    text.setFontSize(15.0);
    text.setForegroundColor(Some(&fg));
    text.setAlignmentMode(&ns("center"));
    text.setContentsScale(scale);
    root.addSublayer(&text);

    // ---- 三个加载点 ----
    let dots_y_top = text_y_top + 20.0 + 18.0;
    for i in 0..3i64 {
        let dot = CALayer::new();
        let x = w / 2.0 - 16.5 + i as f64 * 13.0;
        dot.setFrame(frame_of(x, dots_y_top, 7.0, 7.0));
        dot.setCornerRadius(3.5);
        dot.setBackgroundColor(Some(&srgb(0.29, 0.62, 1.0, 1.0))); // #4a9eff
        pulse_animation(&dot, i as f64 * 0.2);
        root.addSublayer(&dot);
    }

    content.addSubview(&container);
    // 记录容器指针供 dismiss 使用
    *SPLASH_PTR.lock().unwrap() = Retained::into_raw(container) as usize;
    *SPLASH_START.lock().unwrap() = Some(std::time::Instant::now());
}

/// 移除原生启动画面（主线程，幂等）：0.2s 淡出后摘除 view。
/// 与底下早已渲染的 HTML splash 同色，交叉期视觉无感；即使时序略有偏差
/// 也表现为柔和过渡而非硬切闪变。返回是否发起了移除。
pub fn dismiss() -> bool {
    let ptr = std::mem::replace(&mut *SPLASH_PTR.lock().unwrap(), 0);
    if ptr == 0 {
        return false;
    }
    let view = unsafe { Retained::from_raw(ptr as *mut NSView).unwrap() };
    let layer = view.layer();
    objc2_quartz_core::CATransaction::begin();
    objc2_quartz_core::CATransaction::setAnimationDuration(0.2);
    // 淡出完成后摘除（栈 block 会被 CATransaction 拷贝持有；闭包拥有 view 的 Retained）
    // SAFETY: block 签名与 API 期望一致（无参无返）
    unsafe {
        let block = block2::StackBlock::new(move || {
            view.removeFromSuperview();
        });
        objc2_quartz_core::CATransaction::setCompletionBlock(Some(&block));
    }
    if let Some(layer) = layer.as_deref() {
        layer.setOpacity(0.0);
    }
    objc2_quartz_core::CATransaction::commit();
    true
}

// ---------- 动画 ----------

fn ease() -> Retained<CAMediaTimingFunction> {
    CAMediaTimingFunction::functionWithName(&ns("easeInEaseOut"))
}

fn float_animation(layer: &CALayer) {
    let anim = CABasicAnimation::animationWithKeyPath(Some(&ns("transform.translation.y")));
    anim.setDuration(2.2);
    anim.setRepeatCount(f32::MAX);
    anim.setAutoreverses(true);
    anim.setTimingFunction(Some(&ease()));
    // SAFETY: from/to value 接受任意 NSObject，传入 NSNumber 类型匹配
    unsafe {
        anim.setFromValue(Some(&NSNumber::new_f64(0.0)));
        anim.setToValue(Some(&NSNumber::new_f64(-10.0)));
    }
    layer.addAnimation_forKey(&anim, Some(&ns("float")));
}

fn pulse_animation(layer: &CALayer, delay: f64) {
    let now = layer.convertTime_fromLayer(0.0, None) + delay;
    for (key, from, to) in [("opacity", 0.25, 1.0), ("transform.scale", 0.85, 1.0)] {
        let anim = CABasicAnimation::animationWithKeyPath(Some(&ns(key)));
        anim.setDuration(1.2);
        anim.setRepeatCount(f32::MAX);
        anim.setAutoreverses(true);
        anim.setBeginTime(now);
        anim.setTimingFunction(Some(&ease()));
        // SAFETY: from/to value 接受任意 NSObject，传入 NSNumber 类型匹配
        unsafe {
            anim.setFromValue(Some(&NSNumber::new_f64(from)));
            anim.setToValue(Some(&NSNumber::new_f64(to)));
        }
        layer.addAnimation_forKey(&anim, Some(&ns(key)));
    }
}

// ---------- 绘制 ----------

/// 纯 layer 拼出文件夹图标（对应前端 SVG：渐变蓝主体 + 左上凸舌 + 三条白色文件条）。
/// icon 内部子 layer 以 icon 自身 bounds 为参照，y 向上（底部原点）。
fn build_folder_icon(icon: &CALayer) {
    let (iw, ih) = (88.0, 88.0);
    let s = iw / 1024.0; // SVG viewBox 1024 等比缩放

    // 凸舌：SVG M212 342 h240 l60 70（近似左上小块）
    let tab = CALayer::new();
    tab.setFrame(rect(212.0 * s, ih - (342.0 + 62.0) * s, 294.0 * s, 62.0 * s));
    tab.setCornerRadius(8.0 * s);
    tab.setBackgroundColor(Some(&srgb(0.353, 0.635, 0.941, 1.0))); // #5aa2f0

    // 主体：渐变蓝圆角矩形（SVG y 376~740）
    let body = CAGradientLayer::new();
    body.setFrame(rect(212.0 * s, ih - 740.0 * s, 600.0 * s, 364.0 * s));
    body.setCornerRadius(28.0 * s);
    // SAFETY: CGColor 是 AnyObject 的子类实例，cast 类型正确；
    // setColors 期望 CGColor 数组，元素类型匹配
    let colors: Retained<NSArray<AnyObject>> = unsafe {
        NSArray::from_retained_slice(&[
            Retained::cast_unchecked::<AnyObject>(srgb(0.353, 0.635, 0.941, 1.0)), // #5aa2f0
            Retained::cast_unchecked::<AnyObject>(srgb(0.039, 0.482, 0.941, 1.0)), // #0a7bf0
        ])
    };
    unsafe { body.setColors(Some(&colors)) };

    // 三条白色文件条（SVG rect x=330 y=470/530/590 w=380/290/330 h=26）
    let bars = [(470.0, 380.0, 0.55), (530.0, 290.0, 0.4), (590.0, 330.0, 0.3)];
    for (svg_y, svg_w, alpha) in bars {
        let bar = CALayer::new();
        bar.setFrame(rect(330.0 * s, ih - (svg_y + 26.0) * s, svg_w * s, 26.0 * s));
        bar.setCornerRadius(13.0 * s);
        bar.setBackgroundColor(Some(&srgb(1.0, 1.0, 1.0, alpha)));
        icon.addSublayer(&bar);
    }
    icon.addSublayer(&body);
    icon.addSublayer(&tab);
}

// ---------- 工具 ----------

fn rect(x: f64, y: f64, w: f64, h: f64) -> NSRect {
    NSRect::new(NSPoint::new(x, y), NSSize::new(w, h))
}

fn srgb(r: f64, g: f64, b: f64, a: f64) -> Retained<CGColor> {
    NSColor::colorWithSRGBRed_green_blue_alpha(r, g, b, a).CGColor()
}
