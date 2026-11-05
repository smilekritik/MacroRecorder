#Requires AutoHotkey v2.0
#SingleInstance Force

; Exported from Macro Recorder — combo
; Original bind: F2 (run this script to replay the macro)
; Gamepad, overlay, pixel-trigger and sub-macro actions have no AutoHotkey equivalent and appear as comments.

; note
Send "{a down}"
Send "{a up}"
Sleep 50
Send "{Enter down}"
Send "{Enter up}"
Sleep 10
MouseMove 12, -8, 0, "R"
Click "Left Down"
Click "Left Up"
Sleep 10
SendText "Hi ""x"""
Sleep 10
; [not exported] GamepadButtonDown
