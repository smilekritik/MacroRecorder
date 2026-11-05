#Requires AutoHotkey v2.0
delay := 30
XButton1:: {
    Send "{e down}"
    Sleep delay
    Send "{e up}"
    Loop 2 {
        Click "down"
        Sleep 10
        Click "up"
    }
}
F7::Pause()
