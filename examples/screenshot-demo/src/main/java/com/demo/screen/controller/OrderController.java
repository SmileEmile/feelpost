package com.demo.screen.controller;

import com.demo.screen.dto.OrderCreateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import org.springframework.web.bind.annotation.*;

/**
 * 订单中心接口
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    /**
     * 查询订单列表
     */
    @GetMapping
    @Operation(summary = "查询订单列表", description = "支持状态、客户编号与时间范围筛选。")
    public Object list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String customerId,
            @RequestParam(required = false) String beginDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer size) {
        return null;
    }

    /**
     * 创建订单
     */
    @PostMapping
    @Operation(summary = "创建订单", description = "创建订单并返回订单号，库存不足时返回业务错误。")
    public Object create(@RequestBody OrderCreateRequest request) {
        return null;
    }

    /**
     * 查询订单详情
     */
    @GetMapping("/{orderNo}")
    @Operation(summary = "查询订单详情", description = "根据订单号查询商品明细、支付状态和物流状态。")
    public Object detail(@PathVariable @Parameter(description = "订单号") String orderNo) {
        return null;
    }

    /**
     * 更新订单状态
     */
    @PatchMapping("/{orderNo}/status")
    @Operation(summary = "更新订单状态", description = "仅允许在待支付、已支付、已发货之间流转。")
    public Object updateStatus(@PathVariable String orderNo, @RequestParam String status) {
        return null;
    }
}
