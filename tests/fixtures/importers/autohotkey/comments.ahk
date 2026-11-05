; script header
/*
block about the mode
second line of the block
*/
#Requires AutoHotkey v2.0
XButton1:: {
    ; --- N2D ---
    Click "down"   ; open
    Sleep 10
    Click "up"
    Send "a;b"
    ;
}
