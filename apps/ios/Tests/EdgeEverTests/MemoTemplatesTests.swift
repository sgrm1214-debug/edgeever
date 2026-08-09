import XCTest
@testable import EdgeEver

final class MemoTemplatesTests: XCTestCase {
    func testBuiltInCatalogHasSixItemsBothLocales() {
        let zh = BuiltInMemoTemplates.all(isEnglish: false)
        let en = BuiltInMemoTemplates.all(isEnglish: true)
        XCTAssertEqual(zh.count, 6)
        XCTAssertEqual(en.count, 6)
        XCTAssertEqual(zh[0].name, "灵感速记")
        XCTAssertEqual(en[0].name, "Quick Spark")
        XCTAssertTrue(zh[1].contentMarkdown.contains("会议纪要"))
        XCTAssertTrue(en[1].contentMarkdown.contains("Meeting Minutes"))
        XCTAssertEqual(zh[0].source, .builtin)
        XCTAssertEqual(zh[0].tags, ["template", "quick-note"])
    }

    func testCreateSeedFromSelectableTemplate() {
        let template = SelectableMemoTemplate(
            id: "tpl",
            name: "我的周报",
            description: "desc",
            title: "【周报】",
            contentMarkdown: "## 本周",
            tags: ["work", "weekly"],
            source: .saved
        )
        XCTAssertEqual(template.createSeed.title, "【周报】")
        XCTAssertEqual(template.createSeed.contentMarkdown, "## 本周")
        XCTAssertEqual(template.createSeed.tagsText, "work, weekly")
        XCTAssertTrue(template.createSeed.hasContent)
        XCTAssertFalse(CreateMemoSeed(title: "", contentMarkdown: "", tagsText: "").hasContent)
        XCTAssertTrue(CreateMemoSeed(title: "a", contentMarkdown: "", tagsText: "").hasContent)
    }

    func testFromSavedMapsServerTemplate() {
        let saved = MemoTemplate(
            id: "tpl_1",
            name: "自定义",
            description: "说明",
            title: nil,
            contentMarkdown: "# Hi",
            tags: ["x"],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
        )
        let row = BuiltInMemoTemplates.fromSaved(saved)
        XCTAssertEqual(row.source, .saved)
        XCTAssertEqual(row.title, "自定义")
        XCTAssertEqual(row.contentMarkdown, "# Hi")
    }
}
