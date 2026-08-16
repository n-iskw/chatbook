import AVFAudio
import CoreGraphics
import Foundation

struct SpeechCommand: Decodable {
    let id: String
    let command: String
    let text: String?
    let language: String?
    let rate: Double?
}

struct SpeechEvent: Encodable {
    let event: String
    let id: String?
    let message: String?
}

final class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    var eventHandler: ((String, String?) -> Void)?
    private var ids: [ObjectIdentifier: String] = [:]

    func register(_ utterance: AVSpeechUtterance, id: String) {
        ids[ObjectIdentifier(utterance)] = id
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        eventHandler?("started", ids[ObjectIdentifier(utterance)])
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ids.removeValue(forKey: ObjectIdentifier(utterance))
        eventHandler?("finished", id)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let id = ids.removeValue(forKey: ObjectIdentifier(utterance))
        eventHandler?("cancelled", id)
    }
}

let encoder = JSONEncoder()
let synthesizer = AVSpeechSynthesizer()
let delegate = SpeechDelegate()
synthesizer.delegate = delegate
var activeID: String?
var inputBuffer = Data()

func emit(_ event: String, id: String? = nil, message: String? = nil) {
    let payload = SpeechEvent(event: event, id: id, message: message)
    guard var data = try? encoder.encode(payload) else { return }
    data.append(10)
    FileHandle.standardOutput.write(data)
}

func speechRate(_ value: Double?) -> Float {
    // AVSpeechUtterance uses 0...1 rather than the reader's 0.75x...1.5x scale.
    let readerRate = value ?? 1
    return Float(min(0.8, max(0.25, 0.5 * readerRate)))
}

func postSpeakSelectionShortcut(id: String) -> Bool {
    guard CGPreflightPostEventAccess() else {
        emit("error", id: id, message: "macOSのアクセシビリティ権限が必要です")
        return false
    }

    let source = CGEventSource(stateID: .combinedSessionState)
    guard
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 53, keyDown: true),
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 53, keyDown: false)
    else {
        emit("error", id: id, message: "macOSのキーイベントを作成できません")
        return false
    }
    keyDown.flags = .maskAlternate
    keyUp.flags = .maskAlternate
    keyDown.post(tap: .cghidEventTap)
    keyUp.post(tap: .cghidEventTap)
    return true
}

func handle(_ command: SpeechCommand) {
    switch command.command {
    case "speak-selection":
        if postSpeakSelectionShortcut(id: command.id) {
            emit("selection-started", id: command.id)
        }

    case "stop-selection":
        if postSpeakSelectionShortcut(id: command.id) {
            emit("selection-stopped", id: command.id)
        }

    case "speak":
        guard let text = command.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            emit("error", id: command.id, message: "text is required")
            return
        }

        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = speechRate(command.rate)
        utterance.voice = AVSpeechSynthesisVoice(language: command.language ?? "ja-JP")
        activeID = command.id
        delegate.register(utterance, id: command.id)
        synthesizer.speak(utterance)
        emit("accepted", id: command.id)

    case "pause":
        guard let activeID else { return }
        if synthesizer.pauseSpeaking(at: .word) {
            emit("paused", id: activeID)
        }

    case "resume":
        guard let activeID else { return }
        if synthesizer.continueSpeaking() {
            emit("resumed", id: activeID)
        }

    case "stop":
        synthesizer.stopSpeaking(at: .immediate)
        let stoppedID = activeID
        activeID = nil
        emit("stopped", id: stoppedID)

    default:
        emit("error", id: command.id, message: "unsupported command")
    }
}

func processInput() {
    while let newline = inputBuffer.firstIndex(of: 10) {
        let line = inputBuffer[..<newline]
        inputBuffer.removeSubrange(...newline)
        guard !line.isEmpty else { continue }

        do {
            handle(try JSONDecoder().decode(SpeechCommand.self, from: line))
        } catch {
            emit("error", message: "invalid command: \(error.localizedDescription)")
        }
    }
}

FileHandle.standardInput.readabilityHandler = { handle in
    let data = handle.availableData
    if data.isEmpty {
        DispatchQueue.main.async { exit(0) }
        return
    }
    DispatchQueue.main.async {
        inputBuffer.append(data)
        processInput()
    }
}

RunLoop.main.run()
